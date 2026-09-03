import React from 'react'
import { Cpu, CheckCircle2, ShieldAlert, Sparkles, UserCheck, Wrench, Zap } from 'lucide-react'

export default function NeuralPipeline3D({ currentStep = 2, triageData = null }) {
  const steps = [
    {
      step: 1,
      title: 'Multimodal Intake',
      subtitle: 'Raw grievance ingestion & geotag verification',
      icon: <Zap size={16} />,
      status: currentStep >= 1 ? 'completed' : 'pending'
    },
    {
      step: 2,
      title: 'Neural Triage Core',
      subtitle: triageData ? `${triageData.category} (${triageData.priority} Urgency)` : 'Automated taxonomy extraction',
      icon: <Sparkles size={16} />,
      status: currentStep >= 2 ? 'active' : 'pending'
    },
    {
      step: 3,
      title: 'SLA Matrix & Routing',
      subtitle: triageData ? `Target: ${triageData.sla_hours}h to ${triageData.department}` : 'Dynamic commitment calculation',
      icon: <Cpu size={16} />,
      status: currentStep >= 3 ? 'active' : 'pending'
    },
    {
      step: 4,
      title: 'Dispatch & Resolution',
      subtitle: triageData ? triageData.recommended_action : 'Human-in-the-loop operational assignment',
      icon: <Wrench size={16} />,
      status: currentStep >= 4 ? 'active' : 'pending'
    }
  ]

  return (
    <div className="neural-pipeline-3d">
      <div className="pipeline-header">
        <Sparkles size={16} />
        <strong>KAIROS Neural Triage Stream</strong>
        <span className="pipeline-badge">Autonomous Core</span>
      </div>

      <div className="pipeline-nodes-container">
        {steps.map((s, idx) => (
          <React.Fragment key={s.step}>
            <div className={`pipeline-node-3d ${s.status}`}>
              <div className="node-icon-wrapper">
                {s.icon}
                <span className="node-number">{s.step}</span>
              </div>
              <div className="node-info">
                <strong>{s.title}</strong>
                <p>{s.subtitle}</p>
              </div>
              <div className="node-status-indicator">
                {s.status === 'completed' && <CheckCircle2 size={13} className="done" />}
                {s.status === 'active' && <i className="pulsing-glow" />}
              </div>
            </div>

            {idx < steps.length - 1 && (
              <div className={`pipeline-connector-3d ${currentStep > s.step ? 'active' : ''}`}>
                <div className="connector-laser" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
