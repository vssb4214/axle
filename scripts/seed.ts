import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your env to run the seed script.');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      email: 'demo@example.com',
      display_name: 'Demo Enthusiast',
      city: 'Austin',
      state: 'TX',
      bio: 'Collector of driver-focused cars.'
    })
    .select('*')
    .single();

  if (userError || !user) {
    console.error(userError);
    throw new Error('Failed to create demo user');
  }

  const baseListings = [
    { year: 1998, make: 'BMW', model: 'Z3', trim: '2.8 Roadster' },
    { year: 2004, make: 'BMW', model: '330Ci', trim: 'ZHP' },
    { year: 1995, make: 'Lexus', model: 'SC400', trim: '' },
    { year: 2012, make: 'Toyota', model: 'Tacoma', trim: 'TRD Off-Road' },
    { year: 1996, make: 'Mazda', model: 'Miata', trim: 'NA8' },
    { year: 2015, make: 'Subaru', model: 'WRX', trim: 'Premium' },
    { year: 2010, make: 'Toyota', model: '4Runner', trim: 'Trail' },
    { year: 2008, make: 'Honda', model: 'Civic Si', trim: 'FA5' },
    { year: 2014, make: 'Ford', model: 'Mustang GT', trim: 'Track Pack' },
    { year: 2006, make: 'Lexus', model: 'GX470', trim: '' },
    { year: 2005, make: 'Infiniti', model: 'G35', trim: '6MT Coupe' },
    { year: 2017, make: 'Subaru', model: 'BRZ', trim: 'Limited' }
  ];

  const listingsToInsert = baseListings.map((l, idx) => ({
    user_id: user.id,
    year: l.year,
    make: l.make,
    model: l.model,
    trim: l.trim,
    mileage: 80000 + idx * 5000,
    transmission: 'Manual',
    drivetrain: 'RWD',
    condition: 'very_good',
    title_status: 'clean',
    mods_text: 'Mild enthusiast mods',
    maintenance_text: 'Up to date on maintenance.',
    city: 'Austin',
    state: 'TX',
    intent: idx % 3 === 0 ? 'trade_only' : idx % 3 === 1 ? 'sell_only' : 'trade_or_sell',
    trade_preferences_text: 'Open to interesting trades in similar value range.',
    status: 'active'
  }));

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .insert(listingsToInsert)
    .select('*');

  if (listingsError) {
    console.error(listingsError);
    throw new Error('Failed to insert sample listings');
  }

  console.log(`Seeded ${listings.length} listings.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

