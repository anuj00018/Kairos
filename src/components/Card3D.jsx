import React, { useRef, useState } from 'react'

export default function Card3D({ children, className = '', maxTilt = 8, scale = 1.015, onClick }) {
  const cardRef = useRef(null)
  const [style, setStyle] = useState({})
  const [sheenStyle, setSheenStyle] = useState({ opacity: 0 })

  const handleMouseMove = (e) => {
    const card = cardRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const rotateX = ((y - centerY) / centerY) * -maxTilt
    const rotateY = ((x - centerX) / centerX) * maxTilt

    setStyle({
      transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale}, ${scale}, ${scale})`,
      transition: 'transform 0.08s ease-out'
    })

    // Pure White/Silver Sheen
    const sheenX = (x / rect.width) * 100
    const sheenY = (y / rect.height) * 100
    setSheenStyle({
      opacity: 0.15,
      background: `radial-gradient(circle at ${sheenX}% ${sheenY}%, rgba(255, 255, 255, 0.4), transparent 60%)`
    })
  }

  const handleMouseLeave = () => {
    setStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      transition: 'transform 0.4s ease-out'
    })
    setSheenStyle({
      opacity: 0,
      transition: 'opacity 0.4s ease-out'
    })
  }

  return (
    <div
      ref={cardRef}
      className={`card-3d-container ${className}`}
      style={style}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <div className="card-3d-sheen" style={sheenStyle} />
      <div className="card-3d-content">{children}</div>
    </div>
  )
}

