import mascotOpen from '../../../assets/model-icons/whale-maid-thinking-head.png';
import mascotHalf from '../../../assets/model-icons/whale-maid-thinking-head-half.png';
import mascotClosed from '../../../assets/model-icons/whale-maid-thinking-head-closed.png';

export function ReasoningMascot({ animated = false, size = 27, className = '' }) {
  return <span
    className={`reasoning-mascot${animated ? ' is-animated' : ''}${className ? ` ${className}` : ''}`}
    style={{ '--reasoning-mascot-size': `${size}px` }}
    aria-hidden="true"
  >
    <span className="reasoning-mascot-sprites">
      <img className="reasoning-mascot-open" src={mascotOpen} alt="" draggable="false" />
      <img className="reasoning-mascot-half" src={mascotHalf} alt="" draggable="false" />
      <img className="reasoning-mascot-closed" src={mascotClosed} alt="" draggable="false" />
    </span>
    <svg className="reasoning-mascot-bulb" viewBox="0 0 10 8" shapeRendering="crispEdges">
      <path fill="#FFD65A" d="M1 2h1v1H1zm7 0h1v1H8zM3 2h4v1H3zM2 3h6v3H2z" />
      <path fill="#FFF2A6" d="M4 0h1v1H4zM3 3h3v2H3z" />
      <path fill="#E39A32" d="M3 6h4v1H3zm1 1h2v1H4z" />
    </svg>
  </span>;
}
