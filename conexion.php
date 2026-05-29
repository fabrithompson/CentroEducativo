<?php
// conexion.php
$host = "localhost";
$usuario_db = "root"; // Usuario por defecto en XAMPP
$password_db = ""; // Contraseña por defecto en XAMPP (vacía)
$nombre_db = "educar_transformar_db";

$conn = new mysqli($host, $usuario_db, $password_db, $nombre_db);

if ($conn->connect_error) {
    die(json_encode(["exito" => false, "mensaje" => "Error de conexión a la BD: " . $conn->connect_error]));
}
$conn->set_charset("utf8");
?>