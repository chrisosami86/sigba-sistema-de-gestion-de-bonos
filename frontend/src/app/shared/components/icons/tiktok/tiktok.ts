import { Component, signal } from '@angular/core';
import { LogoSize } from '../interfaces/logo-size.interface';

@Component({
  selector: 'svg-tiktok',
  imports: [],
  templateUrl: './tiktok.html',
})
export class Tiktok {
  sizeLogo = signal<LogoSize>({width: 24, height: 24})
}
