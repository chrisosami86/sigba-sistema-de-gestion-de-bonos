const studentService = require('./students.service');

const createStudent = async (req, res) => {
  try {
    const student = await studentService.createStudent(req.body);
    res.status(201).json(student);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creando estudiante' });
  }
};

const getStudents = async (req, res) => {
  try {
    const { tipo, dia } = req.query;

    const students = await studentService.getStudents({ tipo, dia });

    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo estudiantes' });
  }
};

const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await studentService.getStudentById(id);

    if (!student) {
      return res.status(404).json({ message: 'Estudiante no encontrado' });
    }

    res.json(student);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo estudiante' });
  }
};

const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedStudent = await studentService.updateStudent(id, req.body);

    if (!updatedStudent) {
      return res.status(404).json({ message: 'Estudiante no encontrado' });
    }

    res.json(updatedStudent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error actualizando estudiante' });
  }
};

const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await studentService.deleteStudent(id);

    if (!deleted) {
      return res.status(404).json({ message: 'Estudiante no encontrado' });
    }

    res.json({ message: 'Estudiante eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error eliminando estudiante' });
  }
};

const importStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Debe cargar un archivo Excel' });
    }

    const result = await studentService.importStudentsFromExcel(req.file.buffer);

    res.status(200).json({
      message: 'Carga de estudiantes procesada',
      result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const importSubsidies = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Debe cargar un archivo Excel' });
    }

    const result = await studentService.importSubsidiesFromExcel(req.file.buffer);

    res.status(200).json({
      message: 'Carga de subsidiados procesada',
      result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};



module.exports = {
  getStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
  importStudents,
  importSubsidies,
};
