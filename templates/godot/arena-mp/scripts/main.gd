extends Node3D
# GDK arena main: wires roles (server / client) and dumb visuals.
# Rendering ONLY reads sim/net state (LOG.SIM-RENDER-SEPARATION).
#
# Run modes (user args after the engine arg separator):
#   godot --path . -- --server     dedicated authoritative server
#   godot --path . -- --host       server + local player
#   godot --path .                 client, joins 127.0.0.1:7777

const PlayerVisual := preload("res://scripts/player_visual.gd")

const SERVER_ADDR := "127.0.0.1"
const PORT := 7777

@onready var server_sim: Node = $ServerSim
@onready var client_net: Node = $ClientNet
@onready var players_root: Node3D = $Players
@onready var coins_root: Node3D = $Coins

var visuals: Dictionary = {}
var coin_nodes: Array = []
var own_visual: MeshInstance3D


func _ready() -> void:
	_build_coin_visuals()
	var args := OS.get_cmdline_user_args()
	if args.has("--server"):
		var err: int = server_sim.host(PORT)
		if err == OK:
			print("GDK server listening on port %d" % PORT)
		else:
			push_error("GDK server failed to listen: %s" % err)
		return
	# client (or host-and-play): connect, then spawn visuals from snapshots
	client_net.bind_sim(server_sim)
	client_net.remote_positions.connect(_on_remote_positions)
	client_net.own_state.connect(_on_own_state)
	client_net.coin_states.connect(_on_coin_states)
	client_net.roster_changed.connect(_on_roster)
	client_net.round_state.connect(_on_round_state)
	var peer := ENetMultiplayerPeer.new()
	var err2 := peer.create_client(SERVER_ADDR, PORT)
	if err2 != OK:
		push_error("GDK client failed to start: %s" % err2)
		return
	multiplayer.multiplayer_peer = peer
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(_on_connect_failed)
	print("GDK client connecting to %s:%d ..." % [SERVER_ADDR, PORT])


func _on_connected() -> void:
	client_net.my_id = multiplayer.get_unique_id()
	client_net.reset_for_join()
	client_net.active = true
	print("GDK connected as peer %d" % client_net.my_id)


func _on_connect_failed() -> void:
	push_error("GDK connection failed — is a server running on port %d?" % PORT)


func _ensure_visual(pid: int) -> MeshInstance3D:
	if not visuals.has(pid):
		var v: MeshInstance3D = PlayerVisual.new()
		players_root.add_child(v)
		visuals[pid] = v
	return visuals[pid]


func _on_roster(ids: Array) -> void:
	for pid in ids:
		_ensure_visual(int(pid))
	for pid in visuals.keys():
		if not ids.has(pid):
			visuals[pid].queue_free()
			visuals.erase(int(pid))


func _on_remote_positions(positions: Dictionary) -> void:
	for pid in positions.keys():
		var v := _ensure_visual(int(pid))
		v.global_position = positions[pid]


func _on_own_state(pos: Vector3) -> void:
	if own_visual == null:
		own_visual = _ensure_visual(client_net.my_id)
	own_visual.global_position = pos


func _on_coin_states(states: Array) -> void:
	for i in mini(states.size(), coin_nodes.size()):
		var active_now: bool = int(states[i][2]) == 1
		var node := coin_nodes[i] as MeshInstance3D
		if node.visible != active_now:
			node.visible = active_now


func _on_round_state(_state_name: String) -> void:
	pass  # UI hook point (HUD shows round state)


func _build_coin_visuals() -> void:
	var sim := server_sim as Node
	sim.setup()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.35
	mesh.bottom_radius = 0.35
	mesh.height = 0.12
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.85, 0.1)
	mesh.material = mat
	for coin in sim.coins:
		var n := MeshInstance3D.new()
		n.mesh = mesh
		var p: Vector3 = coin["pos"]
		n.global_position = Vector3(p.x, 0.6, p.z)
		coins_root.add_child(n)
		coin_nodes.append(n)
