import { Component } from '@angular/core';
import { Facebook } from "../icons/facebook/facebook";
import { Instagram } from "../icons/instagram/instagram";
import { Youtube } from "../icons/youtube/youtube";
import { Internet } from "../icons/internet/internet";

@Component({
  selector: 'footer-component',
  imports: [Facebook, Instagram, Youtube, Internet],
  templateUrl: './footer.component.html',
})
export class FooterComponent { }
