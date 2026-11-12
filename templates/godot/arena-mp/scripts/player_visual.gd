extends MeshInstance3D
# GDK player visual — render-only. It reads positions; it never decides them.


func _ready() -> void:
	var cap := CapsuleMesh.new()
	cap.radius = 0.4
	cap.height = 1.6
	mesh = cap
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.25, 0.55, 1.0)
	mesh.material = mat
