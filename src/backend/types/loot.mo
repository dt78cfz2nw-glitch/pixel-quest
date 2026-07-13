module {
  /// Item rarity tiers
  public type ItemRarity = {
    #common;
    #uncommon;
    #rare;
    #epic;
    #legendary;
  };

  /// All collectible item types — kept as a flat variant for easy serialization
  public type ItemType = {
    #Coin;
    #SwordBasic;
    #StaffBasic;
    #LeatherArmor;
    #ClothRobe;
    #IronShield;
    // Crafting output items
    #LargeHealthPotion;
    #ManaPotion;
    #ManaCrystal;
    #WarriorEmblem;
    #MageFocus;
    // New items — Meadow Hub
    #WornSword;
    #RoughShieldFragment;
    #ForestHerb;
    // New items — Forest
    #WolfClawNecklace;
    #DruidsBracelet;
    #SpiritLeaf;
    // New items — Pirate Island
    #PiratesCutlass;
    #NavigatorsCompass;
    #CaptainsHat;
    // New items — Cave
    #CrystalShardStaff;
    #EchoStone;
    #TrollBoneClub;
    // New items — Egypt Island
    #ScorpionStingDagger;
    #PharaohsSignetRing;
    #GoldenScarab;
    // Crafting materials
    #IronOre;
    #MagicCrystal;
    #DesertBloom;
    #GlowingMushroom;
    #ThunderShard;
    #ChainmailShard;
    // Crafted consumables
    #Antidote;
  };

  /// A single inventory entry — amount > 1 only meaningful for Coin stacks
  public type InventoryItem = {
    id : Text;
    itemType : ItemType;
    amount : Nat;
    /// Rarity tier — optional for backward compat with items that predate rarity
    rarity : ?ItemRarity;
  };

  /// Snapshot of a player's equipped slots — all optional (null = empty slot)
  public type EquippedGear = {
    weapon : ?Text;
    armor : ?Text;
    offhand : ?Text;
  };
};
