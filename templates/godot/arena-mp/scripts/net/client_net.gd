extends Node
# GDK client net layer. The client is a microphone and a screen:
#  - sends sanitized inputs (no gameplay decisions ever leave the client)
#  - predicts the LOCAL player with the same sim math the server uses
#    (NET.PREDICT-RECONCILE), reconciles against acknowledged server ticks
#  - renders REMOTE players by interpolating between buffered snapshots
#    (NET.SNAPSHOT-INTERP), ~100 ms behind server time

signal remote_positions(positions: Dictionary)
signal own_state(pos: Vector3)
signal coin_states(states: Array)
signal roster_changed(ids: Array)
signal round_state(state_name: String)

const SimMath = preload("res://scripts/sim/sim_math.gd")

const SNAP_BUFFER := 16
const INTERP_DELAY_S := 0.1
const MAX_PENDING := 240
const RECONCILE_EPS_M := 0.001
const HARD_SNAP_M := 0.5

var active := false
var my_id := 1
var seq := 0
var pending: Array = []
var predicted := Vector3.ZERO
var predicted_vel := Vector3.ZERO
var snaps: Array = []
var server_sim: Node


func bind_sim(sim: Node) -> void:
	server_sim = sim
	if not sim.snapshot_received.is_connected(_on_snapshot):
		sim.snapshot_received.connect(_on_snapshot)


func _physics_process(dt: float) -> void:
	if not active or server_sim == null:
		return
	# 1) gather + send input (one per tick)
	var raw := Input.get_vector("mv_left", "mv_right", "mv_forward", "mv_back")
	var mv := SimMath.sanitize_input(raw)
	seq += 1
	if pending.size() < MAX_PENDING:
		pending.append({"seq": seq, "mv": [mv.x, mv.y]})
	server_sim.submit_input.rpc_id(1, {"seq": seq, "mv": [mv.x, mv.y]})
	# 2) predict self using the shared sim math (0-latency feel)
	var stepped := SimMath.step(predicted, predicted_vel, mv, dt)
	predicted = stepped["pos"]
	predicted_vel = stepped["vel"]
	own_state.emit(predicted)
	# 3) render remotes from buffered snapshots
	_emit_remotes()


func _on_snapshot(snap: Dictionary) -> void:
	snaps.append(snap)
	if snaps.size() > SNAP_BUFFER:
		snaps.pop_front()
	_reconcile(snap)
	coin_states.emit(snap.get("c", []))
	round_state.emit(String(snap.get("st", "?")))


func _reconcile(snap: Dictionary) -> void:
	var p: Dictionary = snap.get("p", {})
	if not p.has(my_id):
		return
	var me: Dictionary = p[my_id]
	var ack_seq := int(me.get("ack", 0))
	var server_pos := Vector3(float(me["px"]), float(me["py"]), float(me["pz"]))
	var server_vel := Vector3(float(me["vx"]), float(me["vy"]), float(me["vz"]))
	# drop inputs the server already consumed
	var replay: Array = []
	for m in pending:
		if int(m["seq"]) > ack_seq:
			replay.append(m)
	pending = replay
	var err := predicted.distance_to(server_pos)
	if err <= RECONCILE_EPS_M:
		return
	# resimulate unacknowledged inputs from the server state
	var pos := server_pos
	var vel := server_vel
	for m in replay:
		var raw: Array = m["mv"]
		var mv := SimMath.sanitize_input(Vector2(float(raw[0]), float(raw[1])))
		var stepped := SimMath.step(pos, vel, mv, 1.0 / 60.0)
		pos = stepped["pos"]
		vel = stepped["vel"]
	predicted = pos
	predicted_vel = vel
	if err > HARD_SNAP_M:
		# too far off to blend — snap (should be rare; means desync)
		predicted = server_pos
		predicted_vel = server_vel


func _emit_remotes() -> void:
	if snaps.size() < 2:
		return
	var latest: Dictionary = snaps[snaps.size() - 1]
	var tick_rate := float(ProjectSettings.get_setting("physics/common/physics_ticks_per_second", 60))
	var render_t := float(latest["t"]) - INTERP_DELAY_S * tick_rate
	var older: Dictionary = {}
	var newer: Dictionary = latest
	for s in snaps:
		if float(s["t"]) <= render_t:
			older = s
			newer = s
			continue
		newer = s
		break
	if older.is_empty():
		older = snaps[0]
		newer = snaps[min(1, snaps.size() - 1)]
	var span := maxf(float(newer["t"]) - float(older["t"]), 1.0)
	var alpha := clampf((render_t - float(older["t"])) / span, 0.0, 1.0)
	var out := {}
	var po: Dictionary = older.get("p", {})
	var pn: Dictionary = newer.get("p", {})
	var ids := []
	for pid in pn.keys():
		if pid == my_id:
			continue
		ids.append(pid)
		if not po.has(pid):
			# brand new peer: park them at their newest position
			out[pid] = Vector3(float(pn[pid]["px"]), float(pn[pid]["py"]), float(pn[pid]["pz"]))
			continue
		var a := Vector3(float(po[pid]["px"]), float(po[pid]["py"]), float(po[pid]["pz"]))
		var b := Vector3(float(pn[pid]["px"]), float(pn[pid]["py"]), float(pn[pid]["pz"]))
		out[pid] = a.lerp(b, alpha)
	remote_positions.emit(out)
	if roster_changed.get_connections().size() > 0:
		roster_changed.emit(ids)


func reset_for_join() -> void:
	seq = 0
	pending = []
	snaps = []
	predicted = Vector3.ZERO
	predicted_vel = Vector3.ZERO
