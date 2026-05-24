/// <reference types="@types/google.maps" />
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Input, cn } from '@menukaze/ui';

type PlacesLib = google.maps.PlacesLibrary;
type PlacePrediction = google.maps.places.PlacePrediction;

// Module-level cache — load once per page session
let cachedPlacesLib: PlacesLib | null = null;
let loaderPromise: Promise<PlacesLib | null> | null = null;

function loadPlacesLib(): Promise<PlacesLib | null> {
  const key = process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'];
  if (!key) return Promise.resolve(null);
  if (cachedPlacesLib) return Promise.resolve(cachedPlacesLib);
  if (!loaderPromise) {
    loaderPromise = (async () => {
      setOptions({ key, v: 'weekly' });
      const lib = (await importLibrary('places')) as PlacesLib;
      cachedPlacesLib = lib;
      return lib;
    })();
  }
  return loaderPromise;
}

export interface AddressResult {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
}

interface Props {
  countryCode: string;
  onSelect: (result: AddressResult) => void;
  disabled?: boolean;
}

export function AddressAutocomplete({ countryCode, onSelect, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasKey(Boolean(process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY']));
  }, []);

  // Reset session token when the country restriction changes
  useEffect(() => {
    sessionTokenRef.current = null;
  }, [countryCode]);

  const fetchSuggestions = useCallback(
    async (input: string) => {
      if (input.length < 2) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setFetching(true);
      try {
        const places = await loadPlacesLib();
        if (!places) return;

        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new places.AutocompleteSessionToken();
        }

        const { suggestions: raw } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: sessionTokenRef.current,
            includedRegionCodes: [countryCode.toLowerCase()],
          });

        const predictions = raw
          .map((s: google.maps.places.AutocompleteSuggestion) => s.placePrediction)
          .filter(
            (p: google.maps.places.PlacePrediction | null): p is PlacePrediction => p !== null,
          );

        setSuggestions(predictions);
        setOpen(predictions.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setFetching(false);
      }
    },
    [countryCode],
  );

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchSuggestions(value), 300);
  }

  async function handleSelect(prediction: PlacePrediction) {
    setOpen(false);
    setFetching(true);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['addressComponents', 'location', 'formattedAddress'],
      });

      const components = place.addressComponents ?? [];
      const get = (type: string) =>
        components.find((c: google.maps.places.AddressComponent) => c.types.includes(type))
          ?.longText ?? '';

      const streetNumber = get('street_number');
      const route = get('route');
      const sublocality = get('sublocality_level_1') || get('sublocality');
      const line1 =
        [streetNumber, route].filter(Boolean).join(' ') || sublocality || prediction.text.text;

      const city = get('locality') || get('administrative_area_level_2') || get('postal_town');
      const state = get('administrative_area_level_1');
      const postalCode = get('postal_code');
      const lat = place.location?.lat() ?? null;
      const lng = place.location?.lng() ?? null;

      setQuery(place.formattedAddress ?? prediction.text.text);
      sessionTokenRef.current = null; // session complete — next search gets a fresh token

      onSelect({ line1, city, state, postalCode, lat, lng });
    } catch {
      setQuery(prediction.text.text);
    } finally {
      setFetching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          e.preventDefault();
          void handleSelect(suggestions[activeIndex]);
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  }

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  // Don't render until we know whether the key is configured
  if (hasKey === null || !hasKey) return null;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          type="text"
          placeholder="Search your address…"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="new-password"
          spellCheck={false}
          className="pr-9"
          aria-label="Search address"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
          {fetching ? (
            <SpinnerIcon className="text-muted-foreground h-4 w-4 animate-spin" />
          ) : (
            <SearchIcon className="text-muted-foreground h-4 w-4" />
          )}
        </span>
      </div>

      {open && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="bg-surface border-border absolute z-50 mt-1 w-full overflow-hidden rounded-lg border shadow-lg"
        >
          {suggestions.map((prediction, index) => (
            <li
              key={prediction.placeId}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                'cursor-pointer px-3 py-2.5 text-sm',
                index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/40',
                index > 0 && 'border-border/50 border-t',
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focused until handleSelect finishes
                void handleSelect(prediction);
              }}
            >
              <span className="font-medium">
                {prediction.mainText?.text ?? prediction.text.text}
              </span>
              {prediction.secondaryText ? (
                <span className="text-muted-foreground ml-1">{prediction.secondaryText.text}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
