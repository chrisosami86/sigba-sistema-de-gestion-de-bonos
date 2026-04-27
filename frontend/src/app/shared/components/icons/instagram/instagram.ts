import { Component, signal } from '@angular/core';
import { LogoSize } from '../interfaces/logo-size.interface';


@Component({
  selector: 'svg-instagram',
  imports: [],
  templateUrl: './instagram.html',
})
export class Instagram {
  sizeLogo = signal<LogoSize>({width: 24, height: 24})
}

