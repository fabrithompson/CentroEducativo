<?php
// registro.php
header('Content-Type: application/json');
require 'conexion.php';

// Leer los datos que manda JavaScript (en formato JSON)
$datos = json_decode(file_get_contents("php://input"), true);

if (!$datos) {
    echo json_encode(["exito" => false, "mensaje" => "No se recibieron datos."]);
    exit;
}

$tipo = $datos['tipo'];
$nombre = $datos['nombre'];
$email = $datos['email'];
$usuario = $datos['usuario'];
$password_plana = $datos['password'];
$dni = isset($datos['dni']) ? $datos['dni'] : null;
$curso = isset($datos['curso']) ? $datos['curso'] : null;

// RNF-11: Cifrado bcrypt de la contraseña
$password_encriptada = password_hash($password_plana, PASSWORD_BCRYPT);

// Buscar el ID del rol seleccionado
$stmt_rol = $conn->prepare("SELECT id FROM roles WHERE nombre = ?");
$stmt_rol->bind_param("s", $tipo);
$stmt_rol->execute();
$resultado_rol = $stmt_rol->get_result();

if ($resultado_rol->num_rows === 0) {
    echo json_encode(["exito" => false, "mensaje" => "Rol no válido."]);
    exit;
}

$rol_id = $resultado_rol->fetch_assoc()['id'];

// Insertar el nuevo usuario en la base de datos
$stmt_insert = $conn->prepare("INSERT INTO usuarios (rol_id, nombre_completo, email, usuario, contrasenia, dni, curso) VALUES (?, ?, ?, ?, ?, ?, ?)");
$stmt_insert->bind_param("issssss", $rol_id, $nombre, $email, $usuario, $password_encriptada, $dni, $curso);

if ($stmt_insert->execute()) {
    echo json_encode(["exito" => true, "mensaje" => "Registro exitoso."]);
} else {
    // Si el error es por email o usuario duplicado
    if ($conn->errno == 1062) {
        echo json_encode(["exito" => false, "mensaje" => "El usuario o correo ya están registrados."]);
    } else {
        echo json_encode(["exito" => false, "mensaje" => "Error al registrar: " . $conn->error]);
    }
}

$stmt_rol->close();
$stmt_insert->close();
$conn->close();
?>