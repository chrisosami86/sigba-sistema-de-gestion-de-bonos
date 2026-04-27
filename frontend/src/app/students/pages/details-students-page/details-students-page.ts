import { Component } from '@angular/core';
import { FooterComponent } from "../../../shared/components/footer/footer.component";
import { LogoSIGBA } from "../../../shared/components/logoSIGBA/logoSIGBA";
import { CountdownBonos } from "../../components/countdown-bonos/countdown-bonos";

@Component({
  selector: 'details-students-page',
  imports: [FooterComponent, LogoSIGBA, CountdownBonos],
  templateUrl: './details-students-page.html',
})
export class DetailsStudentsPage { }
