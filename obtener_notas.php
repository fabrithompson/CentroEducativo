<?php
header('Content-Type: application/json');
require 'conexion.php';

// ==========================================
// VALIDACIÓN DEL TOKEN JWT
// ==========================================
$headers = apache_request_headers();
if (!isset($headers['Authorization'])) {
    echo json_encode(["exito" => false, "mensaje" => "Acceso denegado. No se envió el Token de seguridad."]);
    exit;
}

// Extraer el token (viene como "Bearer xxxxx.yyyyy.zzzzz")
$token = str_replace("Bearer ", "", $headers['Authorization']);
$partes = explode('.', $token);

if (count($partes) !== 3) {
    echo json_encode(["exito" => false, "mensaje" => "Formato de Token inválido."]);
    exit;
}

// Validar la firma matemática
$firma_calculada = base64_encode(hash_hmac('sha256', "$partes[0].$partes[1]", 'clave_secreta_tp2', true));
if ($firma_calculada !== $partes[2]) {
    echo json_encode(["exito" => false, "mensaje" => "Firma del Token alterada o no válida."]);
    exit;
}

// Validar la fecha de expiración
$payload = json_decode(base64_decode($partes[1]), true);
if ($payload['exp'] < time()) {
    echo json_encode(["exito" => false, "mensaje" => "El Token ha expirado. Inicie sesión nuevamente."]);
    exit;
}
// ==========================================
// FIN VALIDACIÓN JWT 
// ==========================================

if (!isset($_GET['estudiante_id'])) {
    echo json_encode(["exito" => false, "mensaje" => "Falta el ID del estudiante."]);
    exit;
}

$estudiante_id = (int)$_GET['estudiante_id'];

// Buscamos las notas de este estudiante específico, uniendo con la tabla de usuarios para saber qué profe le puso la nota
$sql = "SELECT c.materia, c.instancia_evaluacion, c.nota, c.fecha, u.nombre_completo as nombre_docente 
        FROM calificaciones c 
        JOIN usuarios u ON c.docente_id = u.id 
        WHERE c.estudiante_id = ? 
        ORDER BY c.fecha DESC";

$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $estudiante_id);
$stmt->execute();
$resultado = $stmt->get_result();

$notas = [];
while ($fila = $resultado->fetch_assoc()) {
    $notas[] = $fila;
}

echo json_encode(["exito" => true, "notas" => $notas]);

$stmt->close();
$conn->close();
?>