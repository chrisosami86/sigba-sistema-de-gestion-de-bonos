import { Component, inject, signal, effect} from '@angular/core';
import { FooterComponent } from '../../../shared/components/footer/footer.component';
import { LogoSIGBA } from '../../../shared/components/logoSIGBA/logoSIGBA';
import { CountdownBonos } from '../../components/countdown-bonos/countdown-bonos';
import { StudentService } from '../../services/student.service';
import type { Student } from '../../interfaces/student.interface';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'details-students-page',
  imports: [FooterComponent, LogoSIGBA, CountdownBonos],
  templateUrl: './details-students-page.html',
})
export class DetailsStudentsPage {

  studenService = inject(StudentService);
  route = inject(ActivatedRoute);
  newStudent = signal<Student | null>(null);

  paramMap = toSignal(this.route.paramMap);

  loadPageById = effect(()=>{
    const params = this.paramMap();

      const id = params?.get('id');

      if (id) {
        this.searchStudent(Number(id));
      }
  });

  searchStudent(id: number) {
    this.studenService.getStudentsById(id).subscribe({
      next: (student: Student) => {
        this.newStudent.set(student);
        console.log(student)
      },
      error: (err) => {
        console.error('Error:', err);
      },
    });
  }
}
