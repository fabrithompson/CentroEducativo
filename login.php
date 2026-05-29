<?php
// login.php
header('Content-Type: application/json');
require 'conexion.php';

$datos = json_decode(file_get_contents("php://input"), true);

if (!$datos) {
    echo json_encode(["exito" => false, "mensaje" => "Datos vacíos."]);
    exit;
}

// RF-4: 2 campos a rellenar
$usuario = $datos['usuario'];
$password_ingresada = $datos['password'];

$stmt = $conn->prepare("SELECT u.id, u.nombre_completo, u.contrasenia, r.nombre as rol FROM usuarios u JOIN roles r ON u.rol_id = r.id WHERE u.usuario = ?");
$stmt->bind_param("s", $usuario);
$stmt->execute();
$resultado = $stmt->get_result();

if ($resultado->num_rows > 0) {
    $user_db = $resultado->fetch_assoc();
    
    if (password_verify($password_ingresada, $user_db['contrasenia'])) {
        
        $header = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = base64_encode(json_encode([
            'id' => $user_db['id'],
            'rol' => $user_db['rol'],
            'exp' => time() + (24 * 60 * 60) // 24 horas en segundos
        ]));
        $signature = base64_encode(hash_hmac('sha256', "$header.$payload", 'clave_secreta_tp2', true));
        $token_jwt = "$header.$payload.$signature";

        $usuario_sesion = [
            "nombre" => $user_db['nombre_completo'],
            "tipo" => $user_db['rol'],
            "token" => $token_jwt
        ];
        
        echo json_encode(["exito" => true, "mensaje" => "Bienvenido", "usuario" => $usuario_sesion]);
    } else {
        echo json_encode(["exito" => false, "mensaje" => "Contraseña incorrecta."]);
    }
} else {
    echo json_encode(["exito" => false, "mensaje" => "El usuario no existe."]);
}

$stmt->close();
$conn->close();
?>