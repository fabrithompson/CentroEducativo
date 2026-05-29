<?php
// login.php
header('Content-Type: application/json');
require 'conexion.php';

$datos = json_decode(file_get_contents("php://input"), true);

if (!$datos) {
    echo json_encode(["exito" => false, "mensaje" => "No se recibieron datos."]);
    exit;
}

$usuario = $datos['usuario'];
$password_ingresada = $datos['password'];

// Buscar el usuario y su rol
$stmt = $conn->prepare("SELECT u.id, u.nombre_completo, u.email, u.usuario, u.contrasenia, r.nombre as rol 
                        FROM usuarios u 
                        JOIN roles r ON u.rol_id = r.id 
                        WHERE u.usuario = ?");
$stmt->bind_param("s", $usuario);
$stmt->execute();
$resultado = $stmt->get_result();

if ($resultado->num_rows > 0) {
    $user_db = $resultado->fetch_assoc();
    
    // RNF-11: Verificar que la contraseña plana coincida con el hash bcrypt guardado
    if (password_verify($password_ingresada, $user_db['contrasenia'])) {
        
        // Creamos la "sesión" para devolverle a JavaScript (sin la contraseña)
        $usuario_sesion = [
            "id" => $user_db['id'],
            "nombre" => $user_db['nombre_completo'],
            "email" => $user_db['email'],
            "usuario" => $user_db['usuario'],
            "tipo" => $user_db['rol']
        ];
        
        echo json_encode(["exito" => true, "mensaje" => "Login correcto", "usuario" => $usuario_sesion]);
    } else {
        echo json_encode(["exito" => false, "mensaje" => "Contraseña incorrecta."]);
    }
} else {
    echo json_encode(["exito" => false, "mensaje" => "El usuario no existe."]);
}

$stmt->close();
$conn->close();
?>