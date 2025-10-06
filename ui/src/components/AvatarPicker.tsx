import React from 'react'

export default function AvatarPicker({ onPick }: any) {
  const avatars = ['avatar1','avatar2','avatar3']
  return (
    <div style={{display:'flex', gap:8}}>
      {avatars.map(a => <div key={a} onClick={()=>onPick(a)} style={{width:48,height:48,border:'1px solid #ccc',display:'flex',alignItems:'center',justifyContent:'center'}}>{a}</div>)}
    </div>
  )
}
