export type BonoTipo = 'almuerzo' | 'refrigerio';

export type EstadoBono = 'subsidiado' | 'venta_libre' | 'bloqueado' | 'cerrado';
export type TipoAsignacionBono = 'OPERATIVA' | 'ADMINISTRATIVA';

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
  tipo_asignacion?: TipoAsignacionBono;
  fecha: string;
  hora_solicitud: string;
  hora_reclamo: string | null;
  expiracion_at: string | null;
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
  tiene_beca: boolean | null;
  tipo: BonoTipo;
  estado: 'reservado' | 'reclamado' | 'expirado';
  tipo_asignacion?: TipoAsignacionBono;
  admin_id?: number | null;
  motivo_asignacion?: string | null;
  modalidad: 'subsidiado' | 'venta_libre' | 'desconocida';
  modalidad_operacional?: string | null;
  hora_solicitud: string;
  hora_reclamo: string | null;
  expiracion_at: string | null;
  codigo_bono: number | null;
  sincronizado_google: boolean;
}

export interface BonoResumenDiarioResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  rows: BonoResumenDiarioRow[];
}

export interface BaseAdministrativaBono {
  tipo: BonoTipo;
  expirados: number;
  noUtilizados: number;
  administrativos: number;
  total: number;
  disponible: number;
}

export type BaseAdministrativaResponse = Record<BonoTipo, BaseAdministrativaBono>;

export interface AsignacionAdministrativaResponse {
  message: string;
  bono: BonoHistorial & {
    codigo_bono: number;
    tipo_asignacion: 'ADMINISTRATIVA';
    admin_id: number | null;
    motivo_asignacion: string | null;
  };
  baseAdministrativa: Omit<BaseAdministrativaBono, 'tipo'>;
  tipo_asignacion: 'ADMINISTRATIVA';
  student: {
    id: number;
    codigo: string;
    nombre: string;
    programa_codigo: string;
    programa_nombre: string;
    activo: boolean;
  };
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
