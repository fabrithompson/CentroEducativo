import { useState } from 'react';

// Selector de estrellas controlado (1 a 5).
export default function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => {
        const lleno = n <= (hover || value);
        return (
          <i
            key={n}
            className={lleno ? 'fas fa-star' : 'far fa-star'}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            role="button"
            aria-label={`${n} estrellas`}
          />
        );
      })}
    </div>
  );
}
