import { Component, input } from '@angular/core';
import { LogoSIGBA } from "../logoSIGBA/logoSIGBA";

export interface PrintableTabla {
  titulo: string;
  columnas: string[];
  filas: string[][];
}

@Component({
  selector: 'app-printable-template',
  standalone: true,
  imports: [LogoSIGBA],
  templateUrl: './printable-template.component.html',
})
export class PrintableTemplateComponent {
  titulo = input('');
  fecha = input<string>('');
  tablas = input<PrintableTabla[]>([]);
}
