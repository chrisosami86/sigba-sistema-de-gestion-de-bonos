import { Component } from '@angular/core';
import { Facebook } from "../icons/facebook/facebook";
import { Instagram } from "../icons/instagram/instagram";
import { Youtube } from "../icons/youtube/youtube";
import { Internet } from "../icons/internet/internet";
import { Tiktok } from "../icons/tiktok/tiktok";

@Component({
  selector: 'footer-component',
  imports: [Facebook, Instagram, Youtube, Internet, Tiktok],
  templateUrl: './footer.component.html',
})
export class FooterComponent { }
