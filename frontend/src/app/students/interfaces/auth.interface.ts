export interface StudentSession {
  id: number;
  codigo: string;
  nombre: string;
  programa_codigo: string;
  programa_nombre: string;
  tipo_estudiante: string;
  tiene_beca: boolean;
  dias: string[];
  must_change_password: boolean;
}

export interface StudentLoginResponse {
  message: string;
  token: string;
  student: StudentSession;
}
