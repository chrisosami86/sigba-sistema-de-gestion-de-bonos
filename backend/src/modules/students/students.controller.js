
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

module.exports = {
  createStudent
};