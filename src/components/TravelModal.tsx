import { useState, useEffect, useCallback } from 'react';
import type { TravelPlace } from '../data/travels';

interface Props {
  place: TravelPlace;
  onClose: () => void;
}

export default function TravelModal({ place, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const next = useCallback(() => {
    setLoaded(false);
    setActiveIndex((i) => (i + 1) % place.photos.length);
  }, [place.photos.length]);

  const prev = useCallback(() => {
    setLoaded(false);
    setActiveIndex((i) => (i - 1 + place.photos.length) % place.photos.length);
  }, [place.photos.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, next, prev]);

  // Reset index when place changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0);
    setLoaded(false);
  }, [place.id]);

  const blurUrl = place.blurs[activeIndex];

  return (
    <div className="travel-modal-overlay" onClick={onClose}>
      <div className="travel-modal" onClick={(e) => e.stopPropagation()}>
        <button className="travel-modal-close" aria-label="Close" type="button" onClick={onClose}>✕</button>
        <h3 className="travel-modal-title">{place.continentEmoji} {place.name}</h3>
        <p className="travel-modal-desc">{place.description}</p>
        <div className="travel-modal-carousel">
          {/* Blur placeholder */}
          {!loaded && blurUrl && (
            <img
              src={blurUrl}
              alt=""
              className="carousel-blur"
            />
          )}
          <button className="carousel-btn carousel-prev" aria-label="Previous photo" type="button" onClick={prev}>‹</button>
          <img
            src={place.photos[activeIndex]}
            alt={`${place.name} ${activeIndex + 1}`}
            className="carousel-img-main"
            onLoad={() => setLoaded(true)}
            style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
          />
          <button className="carousel-btn carousel-next" aria-label="Next photo" type="button" onClick={next}>›</button>
        </div>
        {place.photos.length > 1 && (
          <div className="carousel-dots">
            {place.photos.map((_, i) => (
              <button
                key={i}
                className={`carousel-dot ${i === activeIndex ? 'active' : ''}`}
                aria-label={`Go to photo ${i + 1}`}
                aria-current={i === activeIndex ? 'true' : undefined}
                onClick={() => { setLoaded(false); setActiveIndex(i); }}
              />
            ))}
          </div>
        )}
        <div className="travel-modal-thumbs">
          {place.thumbs.map((thumb, i) => (
            <button
              key={i}
              className={`thumb-button ${i === activeIndex ? 'active' : ''}`}
              aria-label={`View photo ${i + 1} of ${place.name}`}
              type="button"
              onClick={() => { setLoaded(false); setActiveIndex(i); }}
            >
              <img
                src={thumb}
                alt=""
                className={`thumb ${i === activeIndex ? 'active' : ''}`}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
