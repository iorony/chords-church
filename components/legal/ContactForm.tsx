'use client';
import { FormEvent, useState } from 'react';
export default function ContactForm(){
 const [status,setStatus]=useState<'idle'|'sending'|'ok'|'error'>('idle'); const [message,setMessage]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setStatus('sending');setMessage('');const form=new FormData(e.currentTarget);const payload=Object.fromEntries(form.entries());try{const r=await fetch('/api/contacto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||'No se pudo enviar');setStatus('ok');setMessage('Mensaje enviado correctamente.');e.currentTarget.reset();}catch(err){setStatus('error');setMessage(err instanceof Error?err.message:'No se pudo enviar el mensaje.');}}
 return <form onSubmit={submit} className="grid gap-4">
  <div className="grid gap-4 sm:grid-cols-2"><label>Nombre<input required name="name" maxLength={120} className="mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2"/></label><label>Correo<input required type="email" name="email" maxLength={180} className="mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2"/></label></div>
  <label>Asunto<select name="subject" className="mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2"><option>Consulta general</option><option>Privacidad</option><option>Derechos de autor</option><option>Contenido incorrecto</option><option>Soporte técnico</option></select></label>
  <label>Mensaje<textarea required name="message" minLength={10} maxLength={5000} rows={8} className="mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2"/></label>
  <label className="hidden">Sitio web<input name="website" tabIndex={-1} autoComplete="off"/></label>
  {message&&<p className={status==='ok'?'text-green-700':'text-red-600'}>{message}</p>}
  <button disabled={status==='sending'} className="w-full rounded-md bg-primary px-5 py-3 font-medium text-white disabled:opacity-60 sm:w-fit">{status==='sending'?'Enviando...':'Enviar mensaje'}</button>
 </form>
}
