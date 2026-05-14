export interface AdminSession {
  id: number;
  nombre: string;
  correo: string;
  telefono: string;
  must_change_password: boolean;
}

export interface AdminLoginResponse {
  message: string;
  token: string;
  admin: AdminSession;
}
