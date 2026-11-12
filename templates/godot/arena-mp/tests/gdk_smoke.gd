extends SceneTree
# GDK:TEST — headless proof suite (no window, no tree).
# Run: godot --headless --path <project> --script tests/gdk_smoke.gd
# Prints GDK:OK per passing proof, GDK:FAIL per defect, and
# GDK:ALL-TESTS-PASS (exit 0) only if every proof holds.

const SimMath = preload("res://scripts/sim/sim_math.gd")
const GdkGameState = preload("res://scripts/game/game_state.gd")
const ServerSimScript = preload("res://scripts/net/server_sim.gd")

const TICKS := 60.0
const DT := 1.0 / TICKS

var failures := 0


func _initialize() -> void:
	test_determinism()
	test_input_clamp()
	test_gravity_sanity()
	test_fsm_transitions()
	test_playtest_loop()
	if failures == 0:
		print("GDK:ALL-TESTS-PASS")
		quit(0)
	else:
		print("GDK:TESTS-FAILED count=%d" % failures)
		quit(1)


func ok(msg: String) -> void:
	print("GDK:OK %s" % msg)


func fail(msg: String) -> void:
	failures += 1
	print("GDK:FAIL %s" % msg)


func _new_sim() -> Node:
	# Standalone sim node: setup() is idempotent and _is_authoritative()
	# treats out-of-tree nodes as the offline authority, so the sim runs
	# fully headless (LOG.SIM-RENDER-SEPARATION portability).
	var sim: Node = ServerSimScript.new()
	sim.setup()
	return sim


func _drop_sim(sim: Node) -> void:
	sim.free()


func _drive_sim(ticks: int, seed_v: int) -> Array:
	# Drives a two-player offline sim with seeded inputs; returns the position
	# trace of player 101 (exact float tuples) for determinism comparison.
	var sim := _new_sim()
	sim.set_layout_seed(seed_v)
	sim.add_player_local(101, Vector3(0, 0, 0))
	sim.add_player_local(102, Vector3(3, 0, 0))
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var trace := []
	for t in ticks:
		for pid in [101, 102]:
			var mx := rng.randf_range(-1.0, 1.0)
			var mz := rng.randf_range(-1.0, 1.0)
			sim.submit_input_local(pid, {"seq": t + 1, "mv": [mx, mz]})
		sim.sim_tick(DT)
		var pos: Vector3 = sim.players[101]["pos"]
		trace.append([pos.x, pos.y, pos.z])
	_drop_sim(sim)
	return trace


func test_determinism() -> void:
	var a := _drive_sim(300, 4242)
	var b := _drive_sim(300, 4242)
	if a.size() != b.size() or a.size() != 300:
		fail("determinism: trace length %d vs %d" % [a.size(), b.size()])
		return
	for i in a.size():
		if a[i][0] != b[i][0] or a[i][1] != b[i][1] or a[i][2] != b[i][2]:
			fail("determinism: diverged at tick %d" % i)
			return
	ok("determinism: 300 seeded ticks, two runs byte-identical (PHY.DETERMINISM)")


func test_input_clamp() -> void:
	var sim := _new_sim()
	sim.add_player_local(101, Vector3(0, 0, 0))
	# sustained absurd input: 999s and a NaN injection, then max input held
	var speed_seen := 0.0
	for i in 600:
		var mv := [999.0, 999.0]
		if i == 5:
			mv = [NAN, NAN]
		sim.submit_input_local(101, {"seq": i + 1, "mv": mv})
		sim.sim_tick(DT)
		var vel: Vector3 = sim.players[101]["vel"]
		speed_seen = Vector3(vel.x, 0, vel.z).length()
	var pos: Vector3 = sim.players[101]["pos"]
	# the clamp bounds the horizontal velocity MAGNITUDE, so sustained diagonal
	# input holds exactly MAX_SPEED_MPS
	if speed_seen > SimMath.MAX_SPEED_MPS + 0.001:
		fail("clamp: speed %.3f exceeds max %.3f" % [speed_seen, SimMath.MAX_SPEED_MPS])
	elif speed_seen < SimMath.MAX_SPEED_MPS * 0.7:
		fail("clamp: sustained max input produced only %.3f — clamp engaged wrong" % speed_seen)
	elif not is_finite(pos.x) or not is_finite(pos.z):
		fail("clamp: position not finite after NaN input")
	elif pos.length() > 400.0:
		fail("clamp: player escaped the arena (pos %s)" % pos)
	else:
		ok("clamp: sustained 999+NaN input clamps to %.3f <= %.3f (NET.INPUT-VALIDATE)" % [speed_seen, SimMath.MAX_SPEED_MPS])
	_drop_sim(sim)


func test_gravity_sanity() -> void:
	var sim := _new_sim()
	sim.add_player_local(101, Vector3(0, 5, 0))
	var saw_negative_vy := false
	var landed := false
	for i in 120:
		sim.submit_input_local(101, {"seq": i + 1, "mv": [0.0, 0.0]})
		sim.sim_tick(DT)
		var vel: Vector3 = sim.players[101]["vel"]
		var pos: Vector3 = sim.players[101]["pos"]
		if vel.y < 0.0:
			saw_negative_vy = true
		if i >= 100 and pos.y <= SimMath.GROUND_Y + 0.0001 and vel.y == 0.0:
			landed = true
	if saw_negative_vy and landed:
		ok("gravity: accelerated downward and landed at rest (PHY.SANITY-SIM)")
	else:
		fail("gravity: saw_negative_vy=%s landed=%s" % [saw_negative_vy, landed])
	_drop_sim(sim)


func test_fsm_transitions() -> void:
	var g := GdkGameState.new()
	var legal_lobby_play := GdkGameState.can_transition(GdkGameState.GameState.LOBBY, GdkGameState.GameState.PLAYING)
	var illegal_lobby_end := GdkGameState.can_transition(GdkGameState.GameState.LOBBY, GdkGameState.GameState.ROUND_END)
	var legal_play_end := GdkGameState.can_transition(GdkGameState.GameState.PLAYING, GdkGameState.GameState.ROUND_END)
	var legal_end_play := GdkGameState.can_transition(GdkGameState.GameState.ROUND_END, GdkGameState.GameState.PLAYING)
	if legal_lobby_play and not illegal_lobby_end and legal_play_end and legal_end_play:
		ok("fsm: only legal transitions pass (LOG.FSM)")
	else:
		fail("fsm: transition table wrong (%s %s %s %s)" % [legal_lobby_play, illegal_lobby_end, legal_play_end, legal_end_play])
	if not g.transition_to(GdkGameState.GameState.ROUND_END, 1):
		ok("fsm: LOBBY->ROUND_END rejected at runtime")
	else:
		fail("fsm: illegal runtime transition accepted")


func test_playtest_loop() -> void:
	# Bot playtest: steer toward the nearest coin every tick until someone
	# banks SCORE_TO_WIN points and the FSM reaches ROUND_END.
	var sim := _new_sim()
	sim.set_layout_seed(1337)
	sim.add_player_local(101, Vector3(0, 0, 0))
	var max_ticks := 60 * 240
	var reached_end := false
	var collected := false
	for t in max_ticks:
		var pos: Vector3 = sim.players[101]["pos"]
		var target: Vector3 = sim.coins[0]["pos"]
		var best := 1.0e9
		for coin in sim.coins:
			if int(coin["respawn_at"]) != 0:
				continue
			var d := Vector2(pos.x - coin["pos"].x, pos.z - coin["pos"].z).length()
			if d < best:
				best = d
				target = coin["pos"]
		var dir := Vector2(target.x - pos.x, target.z - pos.z)
		if dir.length() > 1.0:
			dir = dir.normalized()
		sim.submit_input_local(101, {"seq": t + 1, "mv": [dir.x, dir.y]})
		sim.sim_tick(DT)
		if sim.fsm.state == GdkGameState.GameState.ROUND_END:
			reached_end = true
			collected = true
			break
	if reached_end and collected:
		ok("playtest: bot looped move->collect->win->ROUND_END in %d sim ticks (QA.PLAYTEST-SCRIPT)" % sim.tick)
	else:
		fail("playtest: bot never reached ROUND_END within %d ticks" % max_ticks)
	_drop_sim(sim)
