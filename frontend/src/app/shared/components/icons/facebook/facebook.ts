import {  Component, signal } from '@angular/core';
import type { LogoSize } from '../interfaces/logo-size.interface';



@Component({
  selector: 'svg-Facebook',
  imports: [],
  templateUrl: './facebook.html',
})
export class Facebook {
  sizeLogo = signal<LogoSize>({width: 24, height: 24})
}

