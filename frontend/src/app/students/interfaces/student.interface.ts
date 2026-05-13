export interface Student {
  id:               number;
  codigo:           string;
  tipo_documento:   string;
  numero_documento: string;
  nombre:           string;
  correo:           string;
  programa_codigo:  string;
  programa_nombre:  string;
  tipo_estudiante:  string;
  periodo_actual:   string | null;
  activo:           boolean;
  tiene_beca:       boolean;
  dias:             string[];
}
