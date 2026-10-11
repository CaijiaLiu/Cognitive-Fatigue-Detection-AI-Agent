'use client';
import { useState } from 'react';
export default function DeleteButton({id}:{id:string}){
 const [state,setState]=useState('删除');return <button disabled={state==='处理中'} onClick={async()=>{if(!confirm('永久删除这段云端数值结果？已导出的文件不受影响。'))return;setState('处理中');try{const r=await fetch('/api/research/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:id})});if(!r.ok)throw Error();location.reload();}catch{setState('失败，重试');}}}>{state}</button>;
}
