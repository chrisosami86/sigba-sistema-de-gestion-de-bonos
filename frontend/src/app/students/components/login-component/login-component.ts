import { Component, inject, signal } from '@angular/core';
import { RouterLink } from "@angular/router";
import { Modal } from "../modal/modal";
import { Student } from '../../interfaces/student.interface';
import { StudentService } from '../../services/student.service';

@Component({
  selector: 'login-component',
  imports: [RouterLink, Modal],
  templateUrl: './login-component.html',
})
export class LoginComponent {

  studentService = inject(StudentService);

  user = signal(0);
  password = signal('');


}
