import { Component, signal } from '@angular/core';
import { LogoSize } from '../interfaces/logo-size.interface';


@Component({
  selector: 'svg-youtube',
  imports: [],
  templateUrl: './youtube.html',
})
export class Youtube {
  sizeLogo = signal<LogoSize>({width: 24, height: 24})
}

