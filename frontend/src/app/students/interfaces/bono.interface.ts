export type BonoTipo = 'almuerzo' | 'refrigerio';

export type EstadoBono = 'subsidiado' | 'venta_libre' | 'bloqueado' | 'cerrado';

export interface EstadoSistemaBono {
  estado: EstadoBono;
  mensaje: string;
}

export interface DisponibilidadBono {
  tipo: BonoTipo;
  totalOperativo: number;
  cantidadBase: number;
  cantidadExtra: number;
  reservasActivas: number;
  reservados: number;
  reclamados: number;
  expirados: number;
  expiradosLiberados: number;
  expiradosPendientes: number;
  noUtilizada: number;
  reutilizables: number;
  disponibles: number;
}

export interface BonoHistorial {
  id: number;
  tipo: BonoTipo;
  estado: 'reservado' | 'reclamado' | 'expirado';
  fecha: string;
  hora_solicitud: string;
  hora_reclamo: string | null;
  expiracion_at: string;
}

export interface SolicitudBonoResponse {
  message: string;
  bono: BonoHistorial & {
    modalidad: 'subsidiado' | 'venta_libre';
    disponibilidad: DisponibilidadBono;
  };
}

export interface BonoResumenDiarioRow {
  id: number;
  codigo: string;
  nombre: string;
  programa_codigo: string;
  programa_nombre: string;
  tipo_estudiante: string;
  tipo: BonoTipo;
  estado: 'reservado' | 'reclamado' | 'expirado';
  modalidad: 'subsidiado' | 'venta_libre' | 'desconocida';
  hora_solicitud: string;
  hora_reclamo: string | null;
  expiracion_at: string;
}

export interface BonoResumenDiarioResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  rows: BonoResumenDiarioRow[];
}

export interface BonoStatsDiarias {
  totalSolicitudes: number;
  reclamados: number;
  reservados: number;
  expirados: number;
  noUtilizados: number;
  frecuenciaUso: number;
  porTipo: Record<BonoTipo, number>;
  porModalidad: {
    subsidiado: number;
    venta_libre: number;
    desconocida: number;
  };
  rows: Array<{
    tipo: BonoTipo;
    estado: string;
    modalidad: string;
    total: number;
  }>;
}
