import { Component } from '@angular/core';
import { Navbar } from "../../../shared/components/navbar/navbar";
import { FooterComponent } from "../../../shared/components/footer/footer.component";
import { LoginComponent } from "../../components/login-component/login-component";
import { LogoSIGBA } from "../../../shared/components/logoSIGBA/logoSIGBA";

@Component({
  selector: 'login-students-page',
  imports: [Navbar, FooterComponent, LoginComponent, LogoSIGBA],
  templateUrl: './login-students-page.html',
})
export class LoginStudentsPage { }
