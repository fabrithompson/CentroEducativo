<?php
header('Content-Type: application/json');
require 'conexion.php';

$datos = json_decode(file_get_contents("php://input"), true);

if (!$datos) {
    echo json_encode(["exito" => false, "mensaje" => "No se recibieron datos."]);
    exit;
}

// Recibimos los datos que pide el RF-8
$estudiante_id = $datos['estudiante_id'];
$docente_id = $datos['docente_id']; // Para saber qué profe la subió
$materia = $datos['materia'];
$instancia = $datos['instancia_evaluacion'];
$nota = (int)$datos['nota'];
$fecha = $datos['fecha'];

// Validación estricta del servidor (RF-8: nota de 1 a 10)
if ($nota < 1 || $nota > 10) {
    echo json_encode(["exito" => false, "mensaje" => "Error: La nota debe ser un número entre 1 y 10."]);
    exit;
}

// Insertamos en la Base de Datos
$stmt = $conn->prepare("INSERT INTO calificaciones (estudiante_id, docente_id, materia, instancia_evaluacion, nota, fecha) VALUES (?, ?, ?, ?, ?, ?)");
$stmt->bind_param("iissis", $estudiante_id, $docente_id, $materia, $instancia, $nota, $fecha);

if ($stmt->execute()) {
    echo json_encode(["exito" => true, "mensaje" => "Calificación guardada exitosamente."]);
} else {
    echo json_encode(["exito" => false, "mensaje" => "Error al guardar la nota en la base de datos."]);
}

$stmt->close();
$conn->close();
?>