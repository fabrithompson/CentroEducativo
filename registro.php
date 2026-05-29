<?php
// registro.php
header('Content-Type: application/json');
require 'conexion.php';

$datos = json_decode(file_get_contents("php://input"), true);

if (!$datos) {
    echo json_encode(["exito" => false, "mensaje" => "Datos vacíos."]);
    exit;
}


$tipo = $datos['tipo'];
$nombre = $datos['nombre'];
$email = $datos['email'];
$dni = $datos['dni']; 
$usuario = $datos['usuario'];
$password_plana = $datos['password'];

// Capturamos el campo extra SOLO si es estudiante
$curso = ($tipo === 'estudiante') ? $datos['curso'] : null;

// Ciframos la contraseña con bcrypt
$password_encriptada = password_hash($password_plana, PASSWORD_BCRYPT);

// Buscamos qué ID tiene el rol elegido
$stmt_rol = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
$stmt_rol->bind_param("s", $tipo);
$stmt_rol->execute();
$resultado_rol = $stmt_rol->get_result();

if ($resultado_rol->num_rows === 0) {
    echo json_encode(["exito" => false, "mensaje" => "Rol no válido en el sistema."]);
    exit;
}
$rol_id = $resultado_rol->fetch_assoc()['id'];

// Guardamos en la Base de Datos 
$stmt_insert = $conn->prepare("INSERT INTO usuarios (rol_id, nombre_completo, email, usuario, contrasenia, dni, curso) VALUES (?, ?, ?, ?, ?, ?, ?)");
$stmt_insert->bind_param("issssss", $rol_id, $nombre, $email, $usuario, $password_encriptada, $dni, $curso);

if ($stmt_insert->execute()) {
    echo json_encode(["exito" => true, "mensaje" => "¡Registro exitoso!"]);
} else {
    echo json_encode(["exito" => false, "mensaje" => "Error: El usuario, DNI o correo ya existen."]);
}

$stmt_rol->close();
$stmt_insert->close();
$conn->close();
?>