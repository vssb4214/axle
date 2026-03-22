declare module 'zipcodes' {
  export type ZipcodeLookup = {
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
  };

  export function lookup(zip: string): ZipcodeLookup | null;

  const zipcodes: {
    lookup: typeof lookup;
  };

  export default zipcodes;
}
