export interface StudentSession {
  id: number;
  codigo: string;
  nombre: string;
  programa_codigo: string;
  programa_nombre: string;
  tipo_estudiante: string;
  tiene_beca: boolean;
  dias: string[];
}

export interface StudentLoginResponse {
  message: string;
  student: StudentSession;
}
