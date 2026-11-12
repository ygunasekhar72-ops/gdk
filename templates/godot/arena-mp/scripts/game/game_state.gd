extends RefCounted
# GDK game flow — an explicit finite state machine (LOG.FSM).
# Pure logic: no nodes, no rendering, headless-testable, serializable.

enum GameState { LOBBY, PLAYING, ROUND_END }

const SCORE_TO_WIN := 10
const ROUND_END_TICKS := 300


static func can_transition(from: int, to: int) -> bool:
	# The single legality table. Anything not listed here is illegal.
	match from:
		GameState.LOBBY:
			return to == GameState.PLAYING
		GameState.PLAYING:
			return to == GameState.ROUND_END
		GameState.ROUND_END:
			return to == GameState.PLAYING
	return false


var state: int = GameState.LOBBY
var round_end_at_tick: int = -1


func transition_to(to: int, at_tick: int) -> bool:
	if not can_transition(state, to):
		return false
	state = to
	if to == GameState.ROUND_END:
		round_end_at_tick = at_tick
	return true


func state_name() -> String:
	match state:
		GameState.LOBBY:
			return "LOBBY"
		GameState.PLAYING:
			return "PLAYING"
		GameState.ROUND_END:
			return "ROUND_END"
	return "UNKNOWN"


func is_round_over(at_tick: int) -> bool:
	return state == GameState.ROUND_END and round_end_at_tick >= 0 and at_tick >= round_end_at_tick


func reset_round() -> void:
	# Called by the authoritative sim when the new round starts.
	state = GameState.PLAYING
	round_end_at_tick = -1
