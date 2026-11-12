extends RefCounted
# GDK:AUTHORITATIVE — shared deterministic sim math.
# The SINGLE SOURCE OF TRUTH for movement integration. The server applies it
# on its fixed tick; clients import the SAME functions for prediction; tests
# drive it headless. Never duplicate this math anywhere else (PHY.DETERMINISM).
#
# Units (PHY.UNIT-CONSIST): meters, seconds; speeds in m/s; accelerations in
# m/s^2; joystick input is unitless [-1,1] converted at exactly one place.

const MAX_SPEED_MPS := 6.0
const ACCEL_MPS2 := 40.0
const FRICTION_MPS2 := 30.0
const GRAVITY_MPS2 := 9.8
const GROUND_Y := 0.0


static func sanitize_input(raw: Vector2) -> Vector2:
	# Reject impossible values, then clamp to the declared range (NET.INPUT-VALIDATE).
	if is_nan(raw.x) or is_nan(raw.y):
		return Vector2.ZERO
	if not is_finite(raw.x) or not is_finite(raw.y):
		return Vector2.ZERO
	return raw.clamp(Vector2(-1.0, -1.0), Vector2(1.0, 1.0))


static func step(pos: Vector3, vel: Vector3, input: Vector2, dt: float) -> Dictionary:
	# Deterministic Euler integration over one fixed tick (NET.TICK-FIXED).
	# input: already-sanitized [-1,1] movement (x = strafe, y = forward).
	var dir := Vector3(input.x, 0.0, input.y)
	if dir.length_squared() > 1.0:
		dir = dir.normalized()
	var hv := Vector3(vel.x, 0.0, vel.z)
	# accelerate toward the input direction
	hv += dir * (ACCEL_MPS2 * dt)
	# friction only when there is no input
	if dir.length_squared() < 0.0001:
		var speed := hv.length()
		var drop := FRICTION_MPS2 * dt
		if speed <= drop:
			hv = Vector3.ZERO
		else:
			hv = hv * (speed - drop) / speed
	# clamp horizontal speed (server-side speedhack immunity)
	var hspeed := hv.length()
	if hspeed > MAX_SPEED_MPS:
		hv = hv * (MAX_SPEED_MPS / hspeed)
	# vertical: gravity, integrate, clamp to ground plane
	var vy := vel.y - GRAVITY_MPS2 * dt
	var np := pos + Vector3(hv.x * dt, vy * dt, hv.z * dt)
	if np.y < GROUND_Y:
		np.y = GROUND_Y
		vy = 0.0
	return {"pos": np, "vel": Vector3(hv.x, vy, hv.z)}


static func coin_layout(count: int, seed_v: int, arena_half: float) -> Array:
	# Seeded, deterministic pickup layout (PHY.DETERMINISM: all randomness
	# comes from a seeded RNG, never from the environment).
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var out := []
	var margin := 2.0
	for i in count:
		var x := rng.randf_range(-arena_half + margin, arena_half - margin)
		var z := rng.randf_range(-arena_half + margin, arena_half - margin)
		out.append(Vector3(x, 0.0, z))
	return out
