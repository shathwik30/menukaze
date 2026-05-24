/// <reference types="@types/google.maps" />
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Input, cn } from '@menukaze/ui';

type MapsLib = google.maps.MapsLibrary;
type PlacesLib = google.maps.PlacesLibrary;
type PlacePrediction = google.maps.places.PlacePrediction;

interface GoogleLibs {
  maps: MapsLib;
  places: PlacesLib;
}

interface Coordinates {
  lat: number;
  lng: number;
}

let cachedLibs: GoogleLibs | null = null;
let loaderPromise: Promise<GoogleLibs | null> | null = null;

function loadGoogleLibs(): Promise<GoogleLibs | null> {
  const key = process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'];
  if (!key) return Promise.resolve(null);
  if (cachedLibs) return Promise.resolve(cachedLibs);
  if (!loaderPromise) {
    loaderPromise = (async () => {
      setOptions({ key, v: 'weekly' });
      const [maps, places] = await Promise.all([
        importLibrary('maps') as Promise<MapsLib>,
        importLibrary('places') as Promise<PlacesLib>,
      ]);
      cachedLibs = { maps, places };
      return cachedLibs;
    })();
  }
  return loaderPromise;
}

function formatCoordinates(value: Coordinates | null): string {
  if (!value) return 'No location selected';
  return `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}`;
}

export function GeolocationMapPicker({
  value,
  onChange,
  disabled,
}: {
  value: Coordinates | null;
  onChange: (value: Coordinates) => void;
  disabled?: boolean;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const placesRef = useRef<PlacesLib | null>(null);
  const disabledRef = useRef(disabled);
  const initialValueRef = useRef(value);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [fetching, setFetching] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Coordinates | null>(value);

  const updateMarker = useCallback(
    (coords: Coordinates, options?: { pan?: boolean }) => {
      setSelected(coords);
      onChange(coords);

      const map = mapRef.current;
      if (!map) return;

      const position = new google.maps.LatLng(coords.lat, coords.lng);
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({
          map,
          position,
          draggable: !disabledRef.current,
          title: 'Restaurant location',
        });
        markerRef.current.addListener('dragend', () => {
          const next = markerRef.current?.getPosition();
          if (!next) return;
          updateMarker({ lat: next.lat(), lng: next.lng() }, { pan: false });
        });
      } else {
        markerRef.current.setPosition(position);
        markerRef.current.setDraggable(!disabledRef.current);
      }

      if (options?.pan ?? true) {
        map.panTo(position);
        if ((map.getZoom() ?? 0) < 16) map.setZoom(16);
      }
    },
    [onChange],
  );

  useEffect(() => {
    disabledRef.current = disabled;
    markerRef.current?.setDraggable(!disabled);
  }, [disabled]);

  useEffect(() => {
    let cancelled = false;
    setHasKey(Boolean(process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY']));

    async function boot() {
      const libs = await loadGoogleLibs();
      if (cancelled || !libs || !mapContainerRef.current) return;
      placesRef.current = libs.places;

      const initialValue = initialValueRef.current;
      const center = initialValue ?? { lat: 12.9716, lng: 77.5946 };
      const map = new libs.maps.Map(mapContainerRef.current, {
        center,
        zoom: initialValue ? 16 : 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      mapRef.current = map;
      setReady(true);

      if (initialValue) updateMarker(initialValue, { pan: false });

      map.addListener('click', (event: google.maps.MapMouseEvent) => {
        if (disabledRef.current || !event.latLng) return;
        updateMarker({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
    }

    void boot();
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [updateMarker]);

  useEffect(() => {
    if (!value) return;
    setSelected(value);
    if (mapRef.current) updateMarker(value, { pan: false });
  }, [updateMarker, value]);

  useEffect(() => {
    function onOutsideClick(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    const places = placesRef.current;
    if (!places || input.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    setFetching(true);
    try {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new places.AutocompleteSessionToken();
      }

      const { suggestions: raw } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
        {
          input,
          sessionToken: sessionTokenRef.current,
        },
      );

      const predictions = raw
        .map((suggestion: google.maps.places.AutocompleteSuggestion) => suggestion.placePrediction)
        .filter((prediction): prediction is PlacePrediction => prediction !== null);

      setSuggestions(predictions);
      setOpen(predictions.length > 0);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setFetching(false);
    }
  }, []);

  function handleSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchSuggestions(value), 300);
  }

  async function handleSelect(prediction: PlacePrediction) {
    setOpen(false);
    setFetching(true);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location'] });
      const location = place.location;
      if (!location) return;

      setQuery(place.formattedAddress ?? prediction.text.text);
      sessionTokenRef.current = null;
      updateMarker({ lat: location.lat(), lng: location.lng() });
    } finally {
      setFetching(false);
    }
  }

  if (hasKey === null) {
    return <div className="border-input bg-muted h-64 rounded-md border" />;
  }

  if (!hasKey) {
    return (
      <div className="border-input bg-muted/40 rounded-md border p-3 text-sm">
        Google Maps is not configured. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to choose the restaurant
        location on a map.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={searchRef} className="relative">
        <Input
          type="text"
          value={query}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder="Search restaurant address"
          disabled={disabled || !ready}
          autoComplete="new-password"
          className="h-9"
        />
        {fetching ? (
          <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs">
            Searching
          </span>
        ) : null}
        {open && suggestions.length > 0 ? (
          <ul className="bg-surface border-border absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border shadow-lg">
            {suggestions.map((prediction) => (
              <li
                key={prediction.placeId}
                className={cn('hover:bg-muted/40 cursor-pointer px-3 py-2 text-sm')}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void handleSelect(prediction);
                }}
              >
                <span className="font-medium">
                  {prediction.mainText?.text ?? prediction.text.text}
                </span>
                {prediction.secondaryText ? (
                  <span className="text-muted-foreground ml-1">
                    {prediction.secondaryText.text}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        ref={mapContainerRef}
        className="border-input bg-muted h-64 overflow-hidden rounded-md border"
        aria-label="Restaurant location map"
      />

      <p className="text-muted-foreground text-xs">
        Search, click the map, or drag the marker to set the geofence center. Current point:{' '}
        <span className="font-mono">{formatCoordinates(selected)}</span>
      </p>
    </div>
  );
}
