export interface AdminSession {
  id: number;
  nombre: string;
  correo: string;
  telefono: string;
}

export interface AdminLoginResponse {
  message: string;
  admin: AdminSession;
}
