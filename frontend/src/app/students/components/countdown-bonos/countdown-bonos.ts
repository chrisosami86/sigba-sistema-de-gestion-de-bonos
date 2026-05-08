import { Component, computed, inject, input, signal } from '@angular/core';
import { Student } from '../../interfaces/student.interface';
import { TimeService } from '../../services/time.service';

@Component({
  selector: 'countdown-bonos',
  imports: [],
  templateUrl: './countdown-bonos.html',
})
export class CountdownBonos {


  systemService = inject(TimeService);

  currentTime = signal(new Date());

  offset = signal(0);


estadoSistema = computed(() => {
  const now = this.currentTime();
  const totalMin = now.getHours() * 60 + now.getMinutes();

  // 🟢 ALMUERZO SUBSIDIADO
  if (totalMin >= 8 * 60 && totalMin <= (10 * 60 + 15)) {
    return { tipo: 'almuerzo', estado: 'subsidiado' };
  }

  // 🟡 ESPERA ALMUERZO (entre subsidiado y venta libre)
  if (totalMin > (10 * 60 + 15) && totalMin < (11 * 60 + 30)) {
    return { tipo: 'almuerzo', estado: 'espera' };
  }

  // 🔵 ALMUERZO VENTA LIBRE
  if (totalMin >= (11 * 60 + 30) && totalMin <= (12 * 60 + 30)) {
    return { tipo: 'almuerzo', estado: 'venta_libre' };
  }

  // 🟢 REFRIGERIO SUBSIDIADO
  if (totalMin >= 17 * 60 && totalMin <= (18 * 60 + 30)) {
    return { tipo: 'refrigerio', estado: 'subsidiado' };
  }

  // 🟡 ESPERA REFRIGERIO
  if (totalMin > (18 * 60 + 30) && totalMin < (18 * 60 + 30)) {
    return { tipo: 'refrigerio', estado: 'espera' };
  }

  // 🔵 REFRIGERIO VENTA LIBRE
  if (totalMin >= (18 * 60 + 30) && totalMin <= (22 * 60)) {
    return { tipo: 'refrigerio', estado: 'venta_libre' };
  }

  // 🔴 FUERA DE TODO
  return { tipo: 'ninguno', estado: 'bloqueado' };
});


tiempoRestante = computed(() => {
  const now = this.currentTime();
  const estado = this.estadoSistema();

  let objetivo = new Date(now);

  if (estado.tipo === 'almuerzo' && estado.estado === 'subsidiado') {
    objetivo.setHours(10, 15, 0, 0);
  }

  else if (estado.tipo === 'almuerzo' && estado.estado === 'espera') {
    objetivo.setHours(11, 30, 0, 0);
  }

  else if (estado.tipo === 'almuerzo' && estado.estado === 'venta_libre') {
    objetivo.setHours(12, 30, 0, 0);
  }

  else if (estado.tipo === 'refrigerio' && estado.estado === 'subsidiado') {
    objetivo.setHours(18, 30, 0, 0);
  }

  else if (estado.tipo === 'refrigerio' && estado.estado === 'venta_libre') {
    objetivo.setHours(22, 0, 0, 0);
  }

  else {
    return 'Fuera de horario';
  }

  const diff = objetivo.getTime() - now.getTime();

  if (diff <= 0) return '00:00:00';

  const horas = Math.floor(diff / (1000 * 60 * 60));
  const minutos = Math.floor((diff / (1000 * 60)) % 60);
  const segundos = Math.floor((diff / 1000) % 60);

  return `${horas.toString().padStart(2, '0')}:${minutos
    .toString()
    .padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
});

  syncWithServer() {
    this.systemService.getServerTime().subscribe({
      next: ({ serverTime }) => {
        const server = new Date(serverTime).getTime();
        const client = new Date().getTime();

        this.offset.set(server - client);
      }
    });
  }

  constructor() {
    this.syncWithServer();

    setInterval(() => {
       const now = new Date().getTime() + this.offset();
      this.currentTime.set(new Date(now));
    }, 1000);
  }




}
