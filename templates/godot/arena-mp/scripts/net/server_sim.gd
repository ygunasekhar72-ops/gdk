extends Node
# GDK:AUTHORITATIVE — the server simulation. THE ONLY place where gameplay
# state is decided (positions, pickups, scores, round state).
#
# Clients send inputs; this node validates/clamps them, integrates the world on
# the fixed tick, and broadcasts snapshots. The same node script exists on
# clients (RPC paths must match) but every mutating path is guarded by
# multiplayer.is_server() and does nothing there.
#
# In headless tests this node runs fully offline (offline peer reports
# is_server() == true) via setup()/submit_input_local()/sim_tick().

signal snapshot_received(snap: Dictionary)

const SimMath = preload("res://scripts/sim/sim_math.gd")
const GdkGameState = preload("res://scripts/game/game_state.gd")

const TICK_RATE := 60
const MAX_CLIENTS := 8
const COIN_COUNT := 12
const COIN_RESPAWN_TICKS := 600
const PICKUP_RADIUS_M := 1.2
const INPUTS_PER_TICK_PER_PEER := 2
const RATE_LIMIT_KICK_STRIKES := 120
const ARENA_HALF := 24.0
const LAYOUT_SEED := 1337
const PORT := 7777

var tick: int = 0
var fsm: RefCounted
var players: Dictionary = {}       # peer_id -> {pos, vel, score, last_seq}
var _pending_inputs: Dictionary = {}  # peer_id -> Array[Dictionary]
var _rate_limit: Dictionary = {}   # peer_id -> {tokens: int, strikes: int}
var coins: Array = []              # [{pos: Vector3, respawn_at: int}]
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	setup()


func _is_authoritative() -> bool:
	# True when this node owns the world: an online server, an offline peer,
	# or a standalone node outside the tree (headless tests).
	var mp := multiplayer
	if mp == null:
		return true
	return mp.is_server()


func setup() -> void:
	# Idempotent init so headless tests can run this node without the tree.
	tick = 0
	fsm = GdkGameState.new()
	_rng.seed = LAYOUT_SEED
	players.clear()
	_pending_inputs.clear()
	_rate_limit.clear()
	coins.clear()
	for p in SimMath.coin_layout(COIN_COUNT, LAYOUT_SEED, ARENA_HALF):
		coins.append({"pos": p, "respawn_at": 0})
	# A hosted/dedicated server starts the round immediately (LOBBY -> PLAYING
	# is the only legal exit from LOBBY); round_end -> PLAYING reuses the FSM.
	fsm.transition_to(GdkGameState.GameState.PLAYING, 0)
	var mp := multiplayer
	if mp != null and mp.multiplayer_peer != null and mp.is_server():
		if not mp.peer_connected.is_connected(_on_peer_connected):
			mp.peer_connected.connect(_on_peer_connected)
			mp.peer_disconnected.connect(_on_peer_disconnected)


func host(port: int) -> int:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, MAX_CLIENTS)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	return OK


func _physics_process(_delta: float) -> void:
	if not _is_authoritative():
		return
	sim_tick(1.0 / float(ProjectSettings.get_setting("physics/common/physics_ticks_per_second", 60)))


func sim_tick(dt: float) -> void:
	# One fixed-tick step of the authoritative world. Callable headless.
	if not _is_authoritative():
		return
	tick += 1
	for pid in _pending_inputs.keys():
		var pl: Dictionary = players.get(pid, {})
		if pl.is_empty():
			continue
		var queue: Array = _pending_inputs[pid]
		var mv := Vector2.ZERO
		var last_seq: int = pl["last_seq"]
		while queue.size() > 0:
			var msg: Dictionary = queue.pop_front()
			if int(msg.get("seq", 0)) <= last_seq:
				continue  # stale/replayed input (SEC: replay rejected)
			last_seq = int(msg["seq"])
			var raw: Array = msg.get("mv", [0.0, 0.0])
			mv = SimMath.sanitize_input(Vector2(float(raw[0]), float(raw[1])))
		pl["last_seq"] = last_seq
		var stepped := SimMath.step(pl["pos"], pl["vel"], mv, dt)
		pl["pos"] = stepped["pos"]
		pl["vel"] = stepped["vel"]
	# refill per-peer input budgets each tick (SEC.RATE-LIMIT)
	for pid in _rate_limit.keys():
		var rl: Dictionary = _rate_limit[pid]
		rl["tokens"] = INPUTS_PER_TICK_PER_PEER
	# coin respawns
	for coin in coins:
		if coin["respawn_at"] > 0 and tick >= int(coin["respawn_at"]):
			coin["respawn_at"] = 0
	# pickups — decided here and only here (SEC.NEVER-TRUST-CLIENT)
	for coin in coins:
		if int(coin["respawn_at"]) != 0:
			continue
		for pid in players.keys():
			var pl2: Dictionary = players[pid]
			var d: Vector3 = pl2["pos"]
			var dxz := Vector2(d.x - coin["pos"].x, d.z - coin["pos"].z)
			if dxz.length() <= PICKUP_RADIUS_M:
				coin["respawn_at"] = tick + COIN_RESPAWN_TICKS
				pl2["score"] = int(pl2["score"]) + 1
				if int(pl2["score"]) >= GdkGameState.SCORE_TO_WIN:
					fsm.transition_to(GdkGameState.GameState.ROUND_END, tick + GdkGameState.ROUND_END_TICKS)
				break
	# round end -> next round
	if fsm.is_round_over(tick):
		fsm.reset_round()
		for pid in players.keys():
			players[pid]["score"] = 0
	# broadcast snapshot to connected peers
	var mp := multiplayer
	if mp != null and mp.get_peers().size() > 0:
		receive_snapshot.rpc(_snapshot())


func _reset_scores() -> void:
	# Score banked at round end; reset for the next round.
	for pid in players.keys():
		players[pid]["score"] = 0


func _snapshot() -> Dictionary:
	var p := {}
	for pid in players.keys():
		var pl: Dictionary = players[pid]
		var pos: Vector3 = pl["pos"]
		var vel: Vector3 = pl["vel"]
		p[pid] = {
			"px": pos.x, "py": pos.y, "pz": pos.z,
			"vx": vel.x, "vy": vel.y, "vz": vel.z,
			"score": pl["score"], "ack": pl["last_seq"],
		}
	var c := []
	for coin in coins:
		c.append([coin["pos"].x, coin["pos"].z, 0 if int(coin["respawn_at"]) != 0 else 1])
	return {"t": tick, "st": fsm.state_name(), "p": p, "c": c}


@rpc("authority", "unreliable_ordered")
func receive_snapshot(_snap: Dictionary) -> void:
	# Runs on clients (server broadcast). Forward to local listeners.
	snapshot_received.emit(_snap)


@rpc("any_peer", "unreliable_ordered")
func submit_input(msg: Dictionary) -> void:
	if not _is_authoritative():
		return
	var pid := multiplayer.get_remote_sender_id()
	submit_input_local(pid, msg)


func submit_input_local(pid: int, msg: Dictionary) -> void:
	# Server-side receive path: rate-limit, then queue for the next tick.
	if not _is_authoritative():
		return
	if not players.has(pid):
		return
	var rl: Dictionary = _rate_limit.get(pid, {"tokens": 0, "strikes": 0})
	if int(rl["tokens"]) <= 0:
		rl["strikes"] = int(rl["strikes"]) + 1
		if int(rl["strikes"]) > RATE_LIMIT_KICK_STRIKES:
			push_warning("GDK: rate_limit kick peer=%d" % pid)
			var mp := multiplayer
			if mp != null and mp.multiplayer_peer != null:
				mp.multiplayer_peer.disconnect_peer(pid)
			_drop_player(pid)
			return
		_rate_limit[pid] = rl
		return
	rl["tokens"] = int(rl["tokens"]) - 1
	rl["strikes"] = maxi(0, int(rl["strikes"]) - 1)
	_rate_limit[pid] = rl
	if not _pending_inputs.has(pid):
		_pending_inputs[pid] = []
	var queue: Array = _pending_inputs[pid]
	if queue.size() < 8:
		queue.append(msg)


func _on_peer_connected(pid: int) -> void:
	add_player_local(pid)


func _on_peer_disconnected(pid: int) -> void:
	_drop_player(pid)


func add_player_local(pid: int, spawn: Variant = null) -> void:
	if players.has(pid):
		return
	var slot := players.size() % MAX_CLIENTS
	var pos: Vector3 = spawn if spawn != null else Vector3(-7.0 + 2.0 * float(slot), 0.0, 0.0)
	players[pid] = {"pos": pos, "vel": Vector3.ZERO, "score": 0, "last_seq": 0}
	_pending_inputs[pid] = []
	_rate_limit[pid] = {"tokens": INPUTS_PER_TICK_PER_PEER, "strikes": 0}


func _drop_player(pid: int) -> void:
	players.erase(pid)
	_pending_inputs.erase(pid)
	_rate_limit.erase(pid)


func set_layout_seed(seed_v: int) -> void:
	# Test hook: overrides the coin layout deterministically.
	_rng.seed = seed_v
	coins.clear()
	for p in SimMath.coin_layout(COIN_COUNT, seed_v, ARENA_HALF):
		coins.append({"pos": p, "respawn_at": 0})
