/*
 * Sample catalogue used only in demo mode (before Supabase is connected).
 * Pictures are drawn by fabric-art.js — one per colour.
 */
(function () {
  const raw = [
    {
      id: 's1', name: 'Bandhani A-line kurti', category: 'Kurtis', price: 1299, mrp: 1599,
      art: ['kurti', 'bandhani'], is_new: true, featured: false,
      colors: [['Rani pink', '#B5195F'], ['Mustard', '#C99316'], ['Bottle green', '#1F5B45']],
      sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
      fabric: 'Pure cotton', care: 'Hand wash cold, dry in shade',
      description: 'Knee-length A-line kurti with hand-tied bandhani dots, a round neck with a short placket and three-quarter sleeves. Soft cotton that stays cool through a long day.'
    },
    {
      id: 's2', name: 'Chanderi anarkali with dupatta', category: 'Anarkali', price: 3499, mrp: 3999,
      art: ['anarkali', 'buti'], is_new: false, featured: true,
      colors: [['Wine', '#6E1B3A'], ['Peacock blue', '#145C7A']],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      fabric: 'Chanderi silk-cotton with cotton lining', care: 'Dry clean recommended',
      description: 'Floor-length anarkali with an all-over buti print and a gold border at the hem. Comes with a matching chanderi dupatta. A full flare that moves well for weddings and pujas.'
    },
    {
      id: 's3', name: 'Leheriya co-ord set', category: 'Co-ord sets', price: 2199, mrp: 2699,
      art: ['coord', 'leheriya'], is_new: true, featured: false,
      colors: [['Teal', '#0F6F73'], ['Coral', '#D9604F']],
      sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'],
      fabric: 'Rayon', care: 'Machine wash gentle, cold',
      description: 'Short straight top and straight-leg pants in a diagonal leheriya wave. Elasticated waist with a drawstring. Wear it together or split it up.'
    },
    {
      id: 's4', name: 'Hand block-print mulmul kurti', category: 'Kurtis', price: 999, mrp: null,
      art: ['kurti', 'block'], is_new: false, featured: false,
      colors: [['Indigo', '#2B3F7A'], ['Rust', '#A8462A']],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      fabric: 'Mulmul cotton', care: 'Hand wash separately, colours may bleed in the first wash',
      description: 'Lightweight everyday kurti hand printed with wooden blocks. Each piece varies slightly in print, which is how you know it was made by hand.'
    },
    {
      id: 's5', name: 'Ajrakh print co-ord set', category: 'Co-ord sets', price: 2499, mrp: null,
      art: ['coord', 'block'], is_new: true, featured: false,
      colors: [['Madder red', '#8E2A23'], ['Indigo', '#24345E']],
      sizes: ['M', 'L', 'XL', 'XXL'],
      fabric: 'Cotton', care: 'Hand wash cold, dry inside out',
      description: 'Ajrakh-inspired geometric print in natural-dye shades. Relaxed top with side slits and straight pants with pockets.'
    },
    {
      id: 's6', name: 'Bandhani silk dupatta', category: 'Dupattas', price: 1199, mrp: 1399,
      art: ['dupatta', 'bandhani'], is_new: false, featured: false,
      colors: [['Red', '#B3122E'], ['Magenta', '#A3196B'], ['Marigold', '#D98A12']],
      sizes: [], custom_fit: false,
      fabric: 'Art silk with zari border', care: 'Dry clean only',
      description: '2.25 metre dupatta with fine bandhani work, a woven zari border and hand-knotted tassels. Pairs with plain kurtis and suits.'
    },
    {
      id: 's7', name: 'Straight rayon kurti', category: 'Kurtis', price: 749, mrp: null,
      art: ['kurti', 'plain'], is_new: false, featured: false,
      colors: [['Black', '#25212A'], ['Ivory', '#E9E2D6'], ['Lemon', '#E2CF4E']],
      sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'],
      fabric: 'Rayon', care: 'Machine wash gentle',
      description: 'A plain straight-cut kurti for office and college. Side slits, three-quarter sleeves and a length that works with leggings, palazzos or jeans.'
    },
    {
      id: 's8', name: 'Festive georgette anarkali', category: 'Anarkali', price: 4299, mrp: 4999,
      art: ['anarkali', 'bandhani'], is_new: false, featured: false, in_stock: false,
      colors: [['Emerald', '#146B4E'], ['Gold beige', '#B9955A']],
      sizes: ['S', 'M', 'L', 'XL'],
      fabric: 'Georgette with satin lining', care: 'Dry clean only',
      description: 'A twelve-panel anarkali with a deep gold hem border. Currently sold out in ready sizes. Message us to have one stitched to your measurements.'
    },
    {
      id: 's9', name: 'Cotton kurta and pant set', category: 'Kurta sets', price: 1799, mrp: 2099,
      art: ['coord', 'buti'], is_new: false, featured: false,
      colors: [['Powder blue', '#7FA6C9'], ['Peach', '#E39C7E']],
      sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
      fabric: 'Cambric cotton', care: 'Machine wash cold',
      description: 'Printed straight kurta with matching pants. Easy, breathable and ready for daily wear.'
    }
  ];

  const now = Date.now();
  window.DARJI_SAMPLE_PRODUCTS = raw.map((p, i) => {
    const colors = p.colors.map(([name, hex], ci) => ({ name, hex, img: ci }));
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      mrp: p.mrp,
      description: p.description,
      fabric: p.fabric,
      care: p.care,
      sizes: p.sizes,
      custom_fit: p.custom_fit !== false,
      colors,
      images: colors.map(c => window.garmentArt(p.art[0], p.art[1], c.hex)),
      visible: true,
      in_stock: p.in_stock !== false,
      is_new: !!p.is_new,
      featured: !!p.featured,
      sort_order: 0,
      created_at: new Date(now - i * 86400000).toISOString(),
      sample: true
    };
  });

  // Example opening hours for demo mode. Set your real hours in Admin → Store details.
  window.DARJI_SAMPLE_SETTINGS = {
    hours: { open: '10:00', close: '20:30', closed: ['Sun'] }
  };

  window.DARJI_SAMPLE_OFFER = {
    id: 'o1',
    text: 'Diwali offer: free stitching on all custom orders',
    ends_at: new Date(now + 4 * 86400000 + 5 * 3600000).toISOString(),
    active: true
  };
})();
