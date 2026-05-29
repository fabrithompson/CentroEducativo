<?php
header('Content-Type: application/json');
require 'conexion.php';


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