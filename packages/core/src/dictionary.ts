// Built-in ingredient dictionary: the starter ingredients plus common Spanish supermarket food.
// Ids of the extra entries are the slug of the Spanish name ("leche", "arroz"), which is what the free-text
// ingredients of earlier kitchens already used, so old data resolves to a real entry without migration.
import { INGREDIENTS } from './seed';
import { categoryId } from './categories';
import { slugify } from './text';

export interface DictIngredient {
  id: string;
  name: string;
  nameEn: string;
  aliases: string[];
  /** Category id (see categories.ts). */
  category: string;
  defaultUnit: string;
  /** Typical weight of one unit in grams (for costing "2 cebollas"). */
  unitWeightG?: number;
  /** Place override; default is the category's. */
  place?: 'nevera' | 'despensa' | 'congelador';
  isStaple?: boolean;
  /** EU allergens it contains (gluten, lactosa, huevo, pescado, marisco, frutos_secos, cacahuete, soja, sesamo, apio, mostaza). */
  allergens: string[];
  /** Not vegetarian although its category is (e.g. chicken stock). */
  meat?: boolean;
  builtin: true;
}

const SEED_CATEGORY: Record<string, string> = {
  tomato: 'verdura', cucumber: 'verdura', green_pepper: 'verdura', onion: 'tuberculo', garlic: 'tuberculo', bread: 'pan', egg: 'huevo',
  potato: 'tuberculo', lentil: 'seco', carrot: 'verdura', chorizo: 'embutido', pumpkin: 'verdura', pasta: 'seco', basil: 'hierba',
  parmesan: 'queso', pine_nuts: 'frutoseco', chicken: 'ave', lemon: 'fruta', apple: 'fruta', banana: 'fruta', orange: 'fruta',
  olive_oil: 'aceite', salt: 'basico', black_pepper: 'especia', vinegar: 'aceite', water: 'basico', sugar: 'basico',
};
const SEED_EXTRA: Record<string, { aliases?: string[]; unit?: string; g?: number; a?: string[]; place?: DictIngredient['place'] }> = {
  tomato: { aliases: ['tomates', 'tomate pera', 'tomate rama', 'tomate ensalada', 'tomate canario', 'tomate cherry', 'tomate de rama'], unit: 'kg', g: 150 },
  cucumber: { aliases: ['pepinos'], g: 250 },
  green_pepper: { aliases: ['pimiento', 'pimientos', 'pimiento italiano', 'pimiento verde italiano', 'pimientos verdes', 'pimiento de freir'], g: 150 },
  onion: { aliases: ['cebollas', 'cebolla blanca', 'cebolla dulce', 'cebolla morada', 'cebolla tierna', 'cebolleta'], unit: 'kg', g: 150 },
  garlic: { aliases: ['ajos', 'diente de ajo', 'dientes de ajo', 'cabeza de ajo', 'ajo morado'], unit: 'ud', g: 5 },
  bread: { aliases: ['barra de pan', 'pan de barra', 'pan blanco', 'pan integral', 'pan de molde', 'pan rustico', 'barra', 'baguette', 'chapata', 'pan de hogaza', 'hogaza'], a: ['gluten'] },
  egg: { aliases: ['huevos', 'huevo l', 'huevo m', 'huevos l', 'huevos m', 'huevos camperos', 'huevos frescos', 'huevos grandes', 'huevo campero', 'docena de huevos', 'eggs'], g: 60, a: ['huevo'] },
  potato: { aliases: ['patatas', 'patata nueva', 'patata para freir', 'patata monalisa', 'papas', 'potatoes'], unit: 'kg', g: 200 },
  lentil: { aliases: ['lenteja', 'lentejas pardinas', 'lentejas castellanas', 'lentejas verdinas', 'lenteja pardina'], unit: 'kg' },
  carrot: { aliases: ['zanahorias', 'zanahoria baby'], unit: 'kg', g: 100 },
  chorizo: { aliases: ['chorizos', 'chorizo ibérico', 'chorizo iberico', 'chorizo de cantimpalo', 'chorizo sarta', 'chorizo fresco'], unit: 'ud', g: 60 },
  pumpkin: { aliases: ['calabaza asar', 'calabaza de cacahuete', 'calabaza butternut'], unit: 'kg' },
  pasta: { aliases: ['macarrones', 'espaguetis', 'espagueti', 'spaghetti', 'fideos', 'tallarines', 'fusilli', 'penne', 'pasta seca', 'tirabuzones', 'lazos', 'rigatoni'], unit: 'g', a: ['gluten'] },
  basil: { aliases: ['albahaca fresca'], unit: 'ud' },
  parmesan: { aliases: ['queso parmesano', 'parmigiano', 'parmesano rallado', 'grana padano'], unit: 'g', a: ['lactosa'] },
  pine_nuts: { aliases: ['pinones', 'piñón', 'piñon'], unit: 'g', a: ['frutos_secos'] },
  chicken: { aliases: ['pollo entero', 'pechuga', 'pechuga de pollo', 'pechugas de pollo', 'muslo de pollo', 'muslos de pollo', 'contramuslo', 'contramuslos', 'alitas', 'alitas de pollo', 'pollo troceado', 'filetes de pollo', 'pollo asado'], unit: 'kg' },
  lemon: { aliases: ['limones', 'zumo de limon', 'limon exprimido'], g: 100 },
  apple: { aliases: ['manzanas', 'manzana golden', 'manzana fuji', 'manzana gala', 'manzana reineta'], unit: 'kg', g: 180 },
  banana: { aliases: ['platano', 'platanos', 'plátano', 'plátanos', 'banana de canarias', 'platano de canarias', 'bananas'], unit: 'kg', g: 120 },
  orange: { aliases: ['naranjas', 'naranja de zumo', 'naranjas de mesa', 'zumo de naranja natural'], unit: 'kg', g: 200 },
  olive_oil: { aliases: ['aceite', 'aceite de oliva virgen', 'aceite de oliva virgen extra', 'aove', 'aceite virgen extra', 'aceite oliva', 'aceite de oliva suave', 'aceite de oliva intenso', 'olive oil'], unit: 'L' },
  salt: { aliases: ['sal fina', 'sal gruesa', 'sal marina', 'sal en escamas', 'sal yodada'], unit: 'g' },
  black_pepper: { aliases: ['pimienta', 'pimienta molida', 'pimienta negra molida', 'pimienta en grano', 'pimienta blanca'], unit: 'g' },
  vinegar: { aliases: ['vinagre de vino', 'vinagre de manzana', 'vinagre balsamico', 'vinagre de jerez', 'vinagre de vino tinto', 'vinagre de vino blanco', 'modena'], unit: 'L', a: ['sulfitos'] },
  water: { aliases: ['agua del grifo', 'agua caliente', 'agua fria'], unit: 'L' },
  sugar: { aliases: ['azucar blanco', 'azúcar', 'azucar moreno', 'azúcar moreno', 'azucar glas', 'azúcar glas', 'azucar de cana', 'azucarillos'], unit: 'g' },
};

// name | English | category | aliases (comma separated) | default unit | options: g=<grams per unit> p=<place> a=<allergens,…> meat
const EXTRA = `
Pimiento rojo|Red pepper|verdura|pimientos rojos,pimiento rojo asado,pimientos asados|ud|g=180
Pimiento amarillo|Yellow pepper|verdura|pimientos amarillos|ud|g=180
Calabacín|Courgette|verdura|calabacines,calabacin,zucchini|ud|g=250
Berenjena|Aubergine|verdura|berenjenas,eggplant|ud|g=300
Brócoli|Broccoli|verdura|brocoli,brócolis,broccoli|ud|g=400
Coliflor|Cauliflower|verdura|coliflores|ud|g=700
Judías verdes|Green beans|verdura|judias verdes,judía verde,judias,green beans|kg
Champiñones|Mushrooms|verdura|champinones,champiñón,champinon,champiñones laminados,setas,mushrooms,portobello,shiitake|g
Espárragos|Asparagus|verdura|esparragos,espárrago,esparragos trigueros,espárragos verdes|g
Puerro|Leek|verdura|puerros,leek|ud|g=150
Apio|Celery|verdura|apio nabo,celery|ud|a=apio|g=60
Maíz|Sweetcorn|verdura|maiz,mazorca,maiz dulce,mazorcas|ud|g=250
Guisantes|Peas|verdura|guisante,peas,guisantes congelados|g
Remolacha|Beetroot|verdura|remolachas,beetroot|ud|g=150
Alcachofa|Artichoke|verdura|alcachofas,artichoke|ud|g=100
Rábano|Radish|verdura|rabanos,rábanos,radish|ud|g=20
Col|Cabbage|verdura|repollo,col blanca,col lombarda,lombarda,col rizada,kale,berza|ud|g=800
Boniato|Sweet potato|tuberculo|boniatos,batata,sweet potato|kg|g=250
Chalota|Shallot|tuberculo|chalotas,shallot,chalotas|ud|g=30
Jengibre|Ginger|verdura|jengibre fresco,raiz de jengibre,ginger|g
Lechuga|Lettuce|hoja|lechugas,lechuga romana,lechuga iceberg,cogollos,cogollo,lollo rosso,lechuga trocadero,romana|ud|g=300
Espinacas|Spinach|hoja|espinaca,espinacas frescas,espinacas baby,spinach|g
Rúcula|Rocket|hoja|rucula,arugula,rocket|g
Canónigos|Lamb's lettuce|hoja|canonigos,canónigo|g
Acelgas|Chard|hoja|acelga,chard|g
Ensalada en bolsa|Bagged salad|hoja|ensalada,ensalada lista,mezclum,mezcla de ensaladas,ensalada mixta,ensalada variada,ensalada de bolsa|ud
Perejil|Parsley|hierba|perejil fresco,parsley|ud
Cilantro|Coriander|hierba|cilantro fresco,coriander|ud
Menta|Mint|hierba|hierbabuena,menta fresca,mint|ud
Cebollino|Chives|hierba|cebollino fresco,chives|ud
Romero|Rosemary|hierba|romero fresco,rosemary|ud
Tomillo|Thyme|hierba|tomillo fresco,thyme|ud
Eneldo|Dill|hierba|eneldo fresco,dill|ud
Aguacate|Avocado|fruta|aguacates,avocado|ud|g=200
Pera|Pear|fruta|peras,pera conferencia,pear|kg|g=180
Mandarina|Mandarin|fruta|mandarinas,clementinas,clementina,satsuma,mandarin|kg|g=80
Lima|Lime|fruta|limas,zumo de lima,lime|ud|g=70
Uvas|Grapes|fruta|uva,uvas blancas,uvas negras,grapes|kg
Fresas|Strawberries|fruta|fresa,fresones,fresón,strawberries|g
Melón|Melon|fruta|melon,melones,melon piel de sapo|ud|g=1500
Sandía|Watermelon|fruta|sandia,sandias,watermelon|ud|g=3000
Melocotón|Peach|fruta|melocoton,melocotones,paraguayo,nectarina,nectarinas,peach|kg|g=150
Piña|Pineapple|fruta|pina,piña natural,pineapple|ud|g=1200
Kiwi|Kiwi|fruta|kiwis|ud|g=80
Mango|Mango|fruta|mangos|ud|g=300
Arándanos|Blueberries|fruta|arandanos,blueberries,frutos rojos,frutas del bosque|g
Frambuesas|Raspberries|fruta|frambuesa,raspberries|g
Pomelo|Grapefruit|fruta|pomelos,grapefruit|ud|g=300
Ciruelas|Plums|fruta|ciruela,plums|kg
Cerezas|Cherries|fruta|cereza,cherries|g
Leche|Milk|leche|leche entera,leche semidesnatada,leche semi,leche semi desnatada,leche desnatada,leche uht,leche fresca,leche sin lactosa,leche de vaca,milk,leche entera uht,leche semi desn,leche desn,leche ent|L|a=lactosa
Leche de coco|Coconut milk|conserva|leche coco,crema de coco,coconut milk|ud
Bebida de avena|Oat drink|leche|bebida de soja,bebida de almendras,bebida vegetal,leche de avena,leche de soja,leche de almendras,bebida de arroz,bebida avena,bebida soja|L
Yogur|Yoghurt|yogur|yogures,yogur natural,yogur griego,yogur desnatado,yogur natural azucarado,yogurt,yogur bio,yogur sabor,yogur de frutas,yogur de coco,griego,yogur con frutas,yogur proteinas,yogur proteico|ud|g=125|a=lactosa
Queso rallado|Grated cheese|queso|queso rallado mozzarella,queso rallado 4 quesos,queso rallado emmental,rallado,mozzarella rallada,queso rallado pizza|g|a=lactosa
Queso|Cheese|queso|queso curado,queso semicurado,queso tierno,queso manchego,manchego,queso en lonchas,queso lonchas,queso cheddar,cheddar,queso edam,edam,gouda,emmental,queso azul,gorgonzola,queso de cabra,queso brie,brie,camembert,queso semi,queso en cuña|g|a=lactosa
Queso fresco|Fresh cheese|quesofresco|queso fresco batido,requeson,requesón,queso burgos,queso de burgos,cottage,queso crema,queso para untar,philadelphia,queso untar,mascarpone,ricotta,queso cremoso|g|a=lactosa
Mozzarella|Mozzarella|quesofresco|mozzarella fresca,bola de mozzarella,mozzarella di bufala,mozarella|ud|a=lactosa
Feta|Feta|quesofresco|queso feta|g|a=lactosa
Mantequilla|Butter|lacteo|mantequilla sin sal,mantequilla con sal,butter,margarina|g|a=lactosa
Nata|Cream|lacteo|nata para cocinar,nata liquida,nata líquida,nata para montar,nata 35,crema de leche,cream,nata cocinar|ml|a=lactosa
Jamón serrano|Cured ham|embutido|jamon serrano,jamon,jamón,jamón ibérico,jamon iberico,taquitos de jamon,taquitos jamon,lonchas de jamon,paleta,paleta ibérica,jamon curado,serrano,jamon reserva|g
Jamón cocido|Cooked ham|fiambre|jamon cocido,jamon york,jamón york,fiambre de jamon,fiambre,pavo cocido,fiambre de pavo,lonchas de pavo,pechuga de pavo fiambre,jamón cocido extra,jamon cocido lonchas|g
Bacon|Bacon|carne|panceta,bacon ahumado,beicon,panceta ahumada,tocino,tiras de bacon,lardones,bacon en lonchas,bacon lonchas|g
Salchichas|Sausages|carne|salchicha,salchichas frescas,salchichas de pollo,frankfurt,frankfurts,salchichas frankfurt,butifarra,butifarras|ud
Salchichón|Salami|embutido|salchichon,fuet,longaniza,salami,lomo embuchado,sobrasada,morcilla,cecina,mortadela|g
Ternera|Beef|carne|carne de ternera,filetes de ternera,ternera guisar,ternera para guisar,añojo,anojo,aguja de ternera,filete de ternera,entrecot,solomillo de ternera,ternera filetes,ternera troceada,carne de vacuno,vacuno,chuletón,chuleton,carrillera,carrilleras,rabo de toro,redondo de ternera,morcillo|kg
Cerdo|Pork|carne|carne de cerdo,lomo de cerdo,lomo,solomillo de cerdo,costillas,costilla,costillas de cerdo,chuletas de cerdo,chuleta de cerdo,secreto ibérico,presa ibérica,magro,magro de cerdo,cerdo troceado,lomo adobado,costillar,filetes de lomo,carne cerdo,pork,panceta de cerdo,codillo|kg
Carne picada|Minced meat|picada|carne picada de ternera,carne picada de cerdo,carne picada mixta,picada de ternera,carne picada vacuno,carne molida,picada mixta,mince,carne picada mixta,carne picada ternera|g
Hamburguesas|Burgers|picada|hamburguesa,burger,burguer,hamburguesa de ternera,hamburguesas de pollo|ud
Cordero|Lamb|carne|carne de cordero,pierna de cordero,paletilla de cordero,chuletas de cordero,lamb,cordero lechal,lechazo|kg
Pavo|Turkey|ave|pechuga de pavo,filetes de pavo,pavo troceado,turkey,muslo de pavo,pavo en filetes|kg
Conejo|Rabbit|carne|conejo troceado,rabbit,muslos de conejo|kg
Salmón|Salmon|pescado|salmon,lomos de salmon,salmon fresco,filete de salmon,lomo de salmon,salmon ahumado,salmón ahumado,salmón noruego|g|a=pescado
Merluza|Hake|pescado|merluza fresca,lomos de merluza,filetes de merluza,merluza del cabo,pescadilla,merluza congelada,hake,merluza en rodajas,lomos merluza|g|a=pescado
Bacalao|Cod|pescado|bacalao fresco,bacalao desalado,lomos de bacalao,bacalao salado,cod,bacalao ahumado,bacalao en salazon|g|a=pescado
Atún|Tuna|conserva|atun,atún claro,atun claro,atun en aceite,atún en aceite,atún al natural,atun al natural,atun claro en aceite de oliva,atún claro en aceite de girasol,bonito del norte,bonito,ventresca,tuna,lata de atun,latas de atun,atun natural,atun claro natural,atun en aceite de oliva|ud|a=pescado
Lubina|Sea bass|pescado|lubina fresca,lubinas,dorada,doradas,pescado fresco,pescado blanco,sea bream,lubina salvaje,dorada salvaje|ud|a=pescado
Sardinas|Sardines|pescado|sardina,boquerones,boquerón,boqueron,anchoas,anchoa,sardinas frescas,caballa,sardinillas,jurel|g|a=pescado
Gambas|Prawns|marisco|gamba,langostinos,langostino,gambón,gambon,gambas peladas,colas de gamba,langostinos cocidos,prawns,shrimp,gambas cocidas,gambas congeladas|g|a=marisco
Calamares|Squid|marisco|calamar,chipirones,chipirón,chipiron,sepia,pulpo,anillas de calamar,rabas,octopus,sepia limpia|g|a=marisco
Mejillones|Mussels|marisco|mejillon,mejillones frescos,mejillones en escabeche,almejas,almeja,berberechos,berberecho,mussels,clams|g|a=marisco
Pan rallado|Breadcrumbs|harina|pan rallado dorado,pan molido,rebozador,rebozado,panko,breadcrumbs,pan rallado|g|a=gluten
Pan de molde|Sliced bread|pan|pan de molde blanco,pan de molde integral,pan bimbo,pan molde,pan sin corteza,pan de molde sin corteza,pan tostado,tostadas,biscotes,biscote,pan de hamburguesa,pan de perrito,pan hamburguesa,pan de hot dog|ud|a=gluten
Wraps|Tortilla wraps|pan|tortillas de trigo,wrap,tortitas,tortilla de maiz,tortillas mexicanas,tortillas de harina,pita,pan de pita,pan pita,arepas,fajitas,tortillas fajitas|ud|a=gluten
Harina|Flour|harina|harina de trigo,harina de fuerza,harina integral,harina de maiz,harina de arroz,harina de garbanzo,flour,harina de repostería,harina tradicional,harina de trigo todo uso|g|a=gluten
Maicena|Cornstarch|harina|harina de maiz maicena,almidon de maiz,almidón de maíz,cornstarch,fecula,fécula|g
Levadura|Yeast|harina|levadura quimica,levadura química,levadura de panadero,levadura fresca,royal,gasificante,bicarbonato,bicarbonato sodico,yeast,baking powder|g
Arroz|Rice|seco|arroz redondo,arroz largo,arroz basmati,arroz integral,arroz bomba,arroz vaporizado,arroz para paella,arroz sushi,arroz jazmin,arroz jazmín,rice,arroz basmati largo,arroz 1kg,arroz cocido,arroz microondas|kg
Espaguetis|Spaghetti|seco|espagueti,spaghetti,espaguetis integrales,tallarines,linguine,fideua,fideuá,fideos finos,fideos gruesos,fideos para sopa|g|a=gluten
Macarrones|Macaroni|seco|macarron,macarrones integrales,pasta corta,pasta penne,penne rigate,tornillos,tirabuzon,tirabuzón,fusilli,rigatoni,lazos,pasta de colores,conchas,pasta fresca|g|a=gluten
Garbanzos|Chickpeas|seco|garbanzo,garbanzos cocidos,garbanzos secos,garbanzo pedrosillano,garbanzos de bote,garbanzos cocidos 400g,chickpeas|g
Alubias|Beans|seco|alubia,alubias blancas,alubias pintas,alubias cocidas,judiones,judion,fabes,fabada,faba,frijoles,alubias rojas,habichuelas,beans,alubias de bote,alubias cocidas bote,alubias blanca,habas secas|g
Cuscús|Couscous|seco|cuscus,couscous,quinoa,bulgur,sémola,semola,mijo,cebada,trigo sarraceno|g|a=gluten
Avena|Oats|harina|copos de avena,avena en copos,porridge,oat,oats,avena integral,muesli,granola|g|a=gluten
Tomate frito|Fried tomato sauce|salsa|tomate frito casero,salsa de tomate,tomate frito estilo casero,tomate frito brick,tomate triturado,tomate natural triturado,tomate pelado,tomates pelados,tomate en conserva,tomate troceado,passata,pasta de tomate,tomate concentrado,concentrado de tomate,sofrito,sofrito de tomate,tomate natural,salsa pizza,salsa de tomate casera,tomate rallado|ud
Mayonesa|Mayonnaise|salsa|mayonesa light,mayonnaise,salsa alioli,alioli,salsa tartara,salsa rosa|ud|a=huevo
Ketchup|Ketchup|salsa|catsup,kétchup,ketchup heinz|ud
Mostaza|Mustard|salsa|mostaza antigua,mostaza dijon,mostaza dulce,mostaza en grano,mustard,mostaza amarilla|ud|a=mostaza
Salsa de soja|Soy sauce|salsa|soja,salsa soja,soy sauce,salsa teriyaki,teriyaki,salsa worcestershire,worcestershire,salsa de ostras,salsa tamari,tamari|ml|a=soja
Caldo|Stock|salsa|caldo de pollo,caldo de verduras,caldo de carne,caldo de pescado,pastilla de caldo,pastillas de caldo,avecrem,gallina blanca,caldo concentrado,stock cube,caldo casero,caldo natural,caldo de ave,caldo de cocido,caldo en brick,brick de caldo|L|meat
Aceitunas|Olives|conserva|aceituna,aceitunas verdes,aceitunas negras,aceitunas rellenas,olives,aceitunas sin hueso,aceitunas manzanilla,aceituna gordal,anchoas aceitunas|ud
Pepinillos|Gherkins|conserva|pepinillo,pepinillos en vinagre,encurtidos,gherkins,cebolletas en vinagre,alcaparras,alcaparra,capers,banderillas,piparras,piparra,guindillas en vinagre|ud
Pimientos del piquillo|Piquillo peppers|conserva|piquillo,piquillos,pimiento del piquillo,pimientos piquillo,pimientos asados bote|ud
Aceite de girasol|Sunflower oil|aceite|girasol,aceite girasol,aceite de semillas,aceite vegetal,aceite para freir,aceite de oliva para freir,sunflower oil,aceite de coco,aceite de sesamo,aceite de colza|L
Orégano|Oregano|especia|oregano,orégano seco,oregano seco,hierbas provenzales,hierbas aromaticas,hierbas aromáticas,mezcla de hierbas,especias,mix de especias,hierbas finas|g
Pimentón|Paprika|especia|pimenton,pimentón dulce,pimenton dulce,pimentón picante,pimenton picante,pimentón de la vera,pimenton de la vera,paprika,pimenton ahumado,pimentón ahumado|g
Comino|Cumin|especia|comino molido,comino en grano,cumin|g
Curry|Curry powder|especia|curry en polvo,polvo de curry,curry powder,garam masala,curcuma,cúrcuma,turmeric,ras el hanout|g
Canela|Cinnamon|especia|canela en polvo,canela molida,canela en rama,cinnamon|g
Laurel|Bay leaf|especia|hojas de laurel,hoja de laurel,laurel seco,bay leaf,hoja de laurel seca|ud
Nuez moscada|Nutmeg|especia|nuez moscada molida,nutmeg,clavo,clavos,cardamomo,anis,anís,anis estrellado|g
Azafrán|Saffron|especia|azafran,hebras de azafran,hebras de azafrán,azafrán en hebras,colorante,colorante alimentario,sazonador,sazonador paella,saffron|g
Vainilla|Vanilla|especia|vainilla en vaina,extracto de vainilla,esencia de vainilla,azucar avainillado,azúcar vainillado,vanilla,vainilla liquida|g
Miel|Honey|dulce|miel de flores,miel de azahar,miel de romero,honey,miel de abeja,sirope,sirope de agave,sirope de arce,sirope de maple,jarabe de arce,agave|g
Chocolate|Chocolate|dulce|chocolate negro,chocolate con leche,chocolate para fundir,chocolate en polvo,cacao,cacao en polvo,cacao puro,chocolate blanco,pepitas de chocolate,tableta de chocolate,chocolate 70,chocolate negro 85,chocolate a la taza,chocolatina,chocolatinas,chips de chocolate,cacao soluble,colacao,cola cao,nesquik,crema de cacao,nocilla,nutella,crema de avellanas|g
Galletas|Biscuits|dulce|galleta,galletas maria,galletas María,galleta maria,galletas digestive,galletas integrales,galletas de chocolate,galletas oreo,oreo,cookies,galletas rellenas,galletas tostadas,galletas de avena,galletas saladas,crackers,galletas dinosaurio,galletas tosta rica,tosta rica,galletas con chocolate|ud|a=gluten
Mermelada|Jam|dulce|mermelada de fresa,mermelada de melocoton,mermelada de naranja,confitura,jam,mermelada de frutas,mermelada de albaricoque,mermelada light,mermelada sin azucar,membrillo,dulce de membrillo|ud
Café|Coffee|desayuno|cafe,café molido,cafe molido,café en grano,café soluble,cafe soluble,café en capsulas,capsulas de cafe,cápsulas de café,nespresso,cápsulas nespresso,cafe en capsulas,cafe tostado,coffee,descafeinado,café descafeinado,monodosis de cafe,cafe natural,cafe mezcla,cafe capsulas,cafe cápsulas|g
Té|Tea|desayuno|te,infusión,infusion,manzanilla,tila,poleo menta,té verde,te verde,te negro,té negro,rooibos,tea,infusiones,bolsitas de te,té en bolsitas,te en bolsitas,infusion relax,infusion digestiva|ud
Cereales|Cereal|desayuno|cereales de desayuno,cereales choco,corn flakes,cornflakes,cereales integrales,cereales de maiz,cereales de arroz,copos de maiz,muesli crujiente,cereal,cereales fitness,cereales chocolate,cereales miel,cereales trigo,cereales con chocolate,cheerios,special k,arroz inflado,barritas de cereales,barritas,cereales con frutos secos,cereales de chocolate|g|a=gluten
Almendras|Almonds|frutoseco|almendra,almendras fritas,almendras crudas,almendras tostadas,almendra molida,almendras laminadas,almendra laminada,almendra marcona,almendras marconas,almonds,almendras fritas con sal|g|a=frutos_secos
Nueces|Walnuts|frutoseco|nuez,nueces peladas,walnuts,nueces con cascara,nueces con cáscara,nueces de nogal,nuez pelada,nueces california|g|a=frutos_secos
Avellanas|Hazelnuts|frutoseco|avellana,avellanas tostadas,hazelnuts,avellanas crudas,avellanas peladas,avellana molida|g|a=frutos_secos
Pistachos|Pistachios|frutoseco|pistacho,pistachos tostados,pistachios,pistachos sin cascara,pistachos con cascara|g|a=frutos_secos
Anacardos|Cashews|frutoseco|anacardo,cashews,anacardos fritos,anacardos tostados,anacardos crudos,nueces de anacardo|g|a=frutos_secos
Cacahuetes|Peanuts|frutoseco|cacahuete,cacahuetes fritos,cacahuetes tostados,peanuts,mantequilla de cacahuete,crema de cacahuete,cacahuetes pelados,cacahuetes con cascara,cacahuetes salados|g|a=cacahuete
Pipas|Sunflower seeds|frutoseco|pipas de girasol,pipas de calabaza,pipas peladas,semillas de girasol,semillas de calabaza,semillas,semillas de chia,chia,semillas de lino,lino,semillas de sesamo,sesamo,sésamo,ajonjolí,ajonjoli,semillas de amapola|g
Pasas|Raisins|frutoseco|pasas de corinto,pasas sultanas,uvas pasas,raisins,dátiles,datiles,datil,dátil,orejones,ciruelas pasas,higos secos,arándanos secos,frutas deshidratadas,fruta deshidratada,pasas rubias|g
Agua envasada|Bottled water|bebida|agua mineral,agua mineral natural,agua con gas,agua sin gas,agua mineral con gas,agua 1,5l,agua 5l,garrafa de agua,garrafa agua,agua de manantial,agua mineral 1,5,pack agua,agua bezoya,agua font vella,agua mineral garrafa,agua fuente,agua pack|L
Refresco|Soft drink|bebida|cola,coca cola,coca-cola,pepsi,fanta,sprite,limonada,gaseosa,tonica,tónica,refresco de cola,refresco de naranja,refresco de limon,refresco de limón,aquarius,nestea,7up,schweppes,tonica schweppes,kas,refresco cola,cola zero,coca cola zero,refresco sin azucar,refresco light,fanta naranja,fanta limon,sprite limon|L
Zumo|Juice|bebida|zumo de naranja,zumo de manzana,zumo de piña,zumo multifruta,zumo de melocoton,zumo de tomate,juice,zumos,zumo exprimido,zumo de uva,zumo de pina,zumo natural,zumo concentrado,néctar,nectar,nectar de melocoton,smoothie,batido,batidos,batido de fresa,batido de chocolate,batido de vainilla,zumo sin azucar|L
Cerveza|Beer|bebida|cervezas,cerveza sin alcohol,cerveza rubia,cerveza negra,cerveza artesana,beer,mahou,estrella galicia,cruzcampo,san miguel,amstel,heineken,alhambra,cerveza lata,cerveza botellin,botellin,botellín,cerveza tostada,cerveza radler,radler,shandy|ud|a=gluten
Vino|Wine|bebida|vino tinto,vino blanco,vino rosado,wine,vino de cocinar,vino para cocinar,cava,champan,champán,vermut,vermouth,sidra,vino joven,vino crianza,vino reserva,rioja,ribera,albariño,albarino,verdejo,rueda|ud|a=sulfitos
Tofu|Tofu|refrigerado|tofu firme,tofu sedoso,tofu ahumado,tempeh,seitan,seitán,soja texturizada,proteina de soja,proteína de soja,tofu natural,tofu extra firme,tofu fresco|g|a=soja
Hummus|Hummus|refrigerado|humus,hummus clasico,hummus clásico,hummus de pimiento,guacamole,tzatziki,baba ganoush,paté vegetal,pate vegetal,paté,pate,paté de campaña,pate de campana,paté de cerdo,pate de higado,foie,foie gras,mousse de pato|ud|a=sesamo
Hojaldre|Puff pastry|refrigerado|masa de hojaldre,masa hojaldre,lamina de hojaldre,lámina de hojaldre,masa de pizza,masa pizza,masa de empanada,masa de empanadillas,masa quebrada,masa brisa,masa de tarta,base de pizza,bases de pizza,masa de pizza fresca,obleas empanadillas,obleas de empanadilla,discos de empanadilla,discos de empanadillas,empanadillas,empanadilla,masa filo,pasta filo,masa fresca,pasta brick,masa brick|ud|a=gluten
Lasaña|Lasagne|seco|lasana,placas de lasaña,placas de lasana,pasta de lasaña,lasaña precocinada,canelones,canelon,canelón,placas de canelones,placas para canelones,pasta para canelones,lasagna,lasanas|ud|a=gluten
Pizza|Pizza|congelado|pizza congelada,pizza fresca,pizza margarita,pizza jamon y queso,pizza barbacoa,pizza cuatro quesos,pizza 4 quesos,pizza carbonara,pizza prosciutto,pizza refrigerada,pizza de la nevera,pizza pepperoni|ud|a=gluten,lactosa
Helado|Ice cream|congelado|helados,helado de vainilla,helado de chocolate,helado de fresa,polo,polos,tarrina de helado,tarrina helado,cono,conos,magnum,cornetto,sorbete,sorbetes,helado vainilla,helado chocolate,tarta helada,tarta de helado,vienetta,helado de limon,helado turron|ud|a=lactosa
Verdura congelada|Frozen vegetables|congelado|menestra congelada,menestra,verduras congeladas,mezcla de verduras congeladas,salteado de verduras,salteado verduras,wok de verduras,wok verduras,espinacas congeladas,guisantes congelados,judias verdes congeladas,brocoli congelado,coliflor congelada,macedonia de verduras,verdura para paella,verduras para paella,sofrito congelado,pisto congelado,pisto,ratatouille,pimientos congelados,champiñones congelados|g
Croquetas|Croquettes|congelado|croqueta,croquetas de jamon,croquetas de pollo,croquetas caseras,croquetas congeladas,croquetas de bacalao,croquetas de cocido,croquetas de espinacas,croquetas de queso,croquetas de setas,croquetas de puchero,croquetas de gambas,croquetas de boletus,croquetas de pollo asado,croquetas de jamon iberico|ud|a=gluten,lactosa,huevo
Patatas fritas|Chips|dulce|patatas fritas de bolsa,patatas chips,chips de patata,patatas fritas bolsa,patatas fritas congeladas,patatas para freir congeladas,patatas congeladas,patata congelada,patatas prefritas,patatas fritas caseras,patatas fritas onduladas,patatas lays,lays,ruffles,pringles,patatas fritas sabor jamon,doritos,cheetos,palomitas,palomitas de maiz,palomitas para microondas,snacks,gusanitos,ganchitos,kikos,matahambre,galletas saladas snack,bolsa de patatas,tortitas de arroz,tortitas de maiz,nachos,tortillas de maiz fritas,totopos|ud
Gelatina|Gelatin|dulce|gelatina neutra,gelatina en hojas,hojas de gelatina,gelatina de fresa,gelatina de limon,gelatina de naranja,gelatina sin azucar,cola de pescado,agar agar,agar-agar,agar,gelatina en polvo,gelatina sabores|ud|meat
Limpieza y hogar|Household items|limpieza|servilletas,papel higienico,papel higiénico,papel de cocina,papel cocina,rollo de cocina,bolsas de basura,bolsa de basura,detergente,suavizante,lavavajillas,lejía,lejia,limpiador,fregasuelos,estropajo,esponja,bayeta,film transparente,papel de aluminio,papel aluminio,papel film,papel de horno,papel vegetal,papel sulfurizado,bolsas de congelar,bolsas zip,servilleta,servilletas de papel,pañuelos,pañuelos de papel,kleenex,toallitas,toallitas humedas,compresas,tampones,pañales,champú,champu,gel de ducha,gel de baño,jabón de manos,jabon de manos,pasta de dientes,dentífrico,dentifrico,cepillo de dientes,desodorante,maquinilla,cuchillas de afeitar,espuma de afeitar,crema hidratante,protector solar,pilas,bombillas,velas,mechero,cerillas,bolsa de plastico,bolsa de plástico,bolsa de papel|ud
`;

const SEED_ALL: DictIngredient[] = INGREDIENTS.map((ing) => {
  const extra = SEED_EXTRA[ing.id] ?? {};
  const category = SEED_CATEGORY[ing.id] ?? categoryId(ing.category);
  return {
    id: ing.id, name: ing.name, nameEn: ing.nameEn,
    aliases: [...(ing.aliases ?? []), ...(extra.aliases ?? [])],
    category, defaultUnit: extra.unit ?? ing.defaultUnit ?? 'ud',
    ...(extra.g ? { unitWeightG: extra.g } : {}), ...(extra.place ? { place: extra.place } : {}),
    ...(ing.isStaple ? { isStaple: true } : {}), allergens: extra.a ?? [], builtin: true as const,
  };
});

function parseExtra(): DictIngredient[] {
  const out: DictIngredient[] = [];
  for (const raw of EXTRA.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [name, nameEn, category, aliases = '', unit = 'ud', ...opts] = line.split('|');
    const entry: DictIngredient = {
      id: slugify(name!), name: name!.trim(), nameEn: (nameEn ?? name)!.trim(), category: categoryId(category),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean), defaultUnit: unit.trim() || 'ud', allergens: [], builtin: true,
    };
    for (const option of opts) {
      const text = option.trim();
      if (text.startsWith('g=')) entry.unitWeightG = Number(text.slice(2));
      else if (text.startsWith('p=')) entry.place = text.slice(2) as DictIngredient['place'];
      else if (text.startsWith('a=')) entry.allergens = text.slice(2).split(',').map((a) => a.trim()).filter(Boolean);
      else if (text === 'meat') entry.meat = true;
    }
    out.push(entry);
  }
  return out;
}

/** The starter 27 followed by the extra entries. */
export const BUILTIN_INGREDIENTS: DictIngredient[] = [...SEED_ALL, ...parseExtra()];
export const BUILTIN_BY_ID: Record<string, DictIngredient> = Object.fromEntries(BUILTIN_INGREDIENTS.map((ing) => [ing.id, ing]));
