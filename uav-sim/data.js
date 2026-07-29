'use strict';

const MODEL_CATALOG = [
  {id:'mini',cat:'civil',name:'Лёгкий квадрокоптер',short:'Mini',family:'Мультикоптер',icon:'✣',launch:'Вертикальный',speed:12,turn:62,climb:6.4,drain:.108,hover:true,stability:91,payload:1,range:2,difficulty:1,unlock:1,price:0,desc:'Простой и устойчивый аппарат для обучения и спокойных заданий.'},
  {id:'camera',cat:'civil',name:'Киносъёмочный квадрокоптер',short:'Cinema',family:'Мультикоптер',icon:'✥',launch:'Вертикальный',speed:15,turn:49,climb:5.2,drain:.098,hover:true,stability:97,payload:2,range:3,difficulty:1,unlock:1,price:0,desc:'Плавный ход, точное зависание и высокая устойчивость камеры.'},
  {id:'hex',cat:'civil',name:'Грузовой гексакоптер',short:'Cargo 6',family:'Гексакоптер',icon:'✺',launch:'Вертикальный',speed:11,turn:34,climb:4.1,drain:.128,hover:true,stability:89,payload:5,range:2,difficulty:2,unlock:2,price:1200,desc:'Тяжёлый, инерционный, но устойчивый к порывам ветра.'},
  {id:'fpv',cat:'civil',name:'Гоночный FPV',short:'FPV',family:'Мультикоптер',icon:'◆',launch:'Вертикальный',speed:28,turn:96,climb:9.5,drain:.172,hover:true,stability:60,payload:0,range:2,difficulty:4,unlock:3,price:2400,desc:'Очень быстрый и резкий. Требует аккуратной работы стиками.'},
  {id:'wing',cat:'civil',name:'Гражданское летающее крыло',short:'Wing',family:'Самолётный',icon:'➤',launch:'С руки',speed:31,turn:31,climb:5,drain:.071,hover:false,stability:76,payload:2,range:6,difficulty:3,unlock:3,price:2800,desc:'Экономичный самолётный профиль для длинных маршрутов.'},
  {id:'vtol',cat:'civil',name:'Гражданский VTOL',short:'VTOL',family:'Гибридный',icon:'✈',launch:'Вертикальный',speed:35,turn:36,climb:6.2,drain:.079,hover:true,stability:84,payload:3,range:7,difficulty:3,unlock:4,price:4200,desc:'Вертикальный старт и эффективный крейсерский полёт.'},
  {id:'rescue',cat:'civil',name:'Спасательный квадрокоптер',short:'Rescue',family:'Мультикоптер',icon:'✚',launch:'Вертикальный',speed:18,turn:47,climb:5.7,drain:.115,hover:true,stability:94,payload:4,range:4,difficulty:2,unlock:5,price:5200,desc:'Устойчивый аппарат с увеличенной полезной нагрузкой.'},
  {id:'agro',cat:'civil',name:'Агродрон',short:'Agro',family:'Октокоптер',icon:'✤',launch:'Вертикальный',speed:10,turn:29,climb:3.8,drain:.14,hover:true,stability:88,payload:6,range:2,difficulty:2,unlock:5,price:4800,desc:'Медленный и тяжёлый аппарат для площадных работ.'},
  {id:'orlan',cat:'mil',name:'Орлан-10 · игровой профиль',short:'Орлан',family:'Самолётный',icon:'➤',launch:'Катапульта',speed:32,turn:28,climb:5.2,drain:.063,hover:false,stability:83,payload:2,range:8,difficulty:3,unlock:2,price:1800,desc:'Условный учебный профиль с длительным полётом.'},
  {id:'eleron',cat:'mil',name:'Элерон-3 · игровой профиль',short:'Элерон',family:'Лёгкий самолётный',icon:'➤',launch:'С руки',speed:25,turn:42,climb:5.8,drain:.086,hover:false,stability:77,payload:1,range:5,difficulty:3,unlock:2,price:1600,desc:'Компактный и манёвренный самолётный профиль.'},
  {id:'zala',cat:'mil',name:'ZALA 421-16E · игровой профиль',short:'ZALA',family:'Самолётный',icon:'➤',launch:'Катапульта',speed:34,turn:32,climb:5.6,drain:.07,hover:false,stability:81,payload:2,range:8,difficulty:3,unlock:3,price:2600,desc:'Стабильный игровой профиль для маршрутных заданий.'},
  {id:'supercam',cat:'mil',name:'SuperCam S350 · игровой профиль',short:'S350',family:'Самолётный',icon:'➤',launch:'Катапульта',speed:36,turn:30,climb:5.5,drain:.065,hover:false,stability:85,payload:2,range:9,difficulty:3,unlock:4,price:3400,desc:'Экономичный профиль с хорошей устойчивостью.'},
  {id:'forpost',cat:'mil',name:'Форпост-Р · игровой профиль',short:'Форпост',family:'Тяжёлый самолётный',icon:'✈',launch:'Полоса',speed:42,turn:20,climb:4.4,drain:.049,hover:false,stability:92,payload:5,range:12,difficulty:4,unlock:5,price:5600,desc:'Тяжёлый и инерционный профиль, рассчитанный на дальние маршруты.'},
  {id:'inohodets',cat:'mil',name:'Иноходец · игровой профиль',short:'Иноходец',family:'Тяжёлый самолётный',icon:'✈',launch:'Полоса',speed:44,turn:18,climb:4.8,drain:.046,hover:false,stability:93,payload:5,range:13,difficulty:4,unlock:6,price:6800,desc:'Условный тяжёлый профиль с большим запасом энергии.'},
  {id:'sirius',cat:'mil',name:'Сириус · игровой профиль',short:'Сириус',family:'Тяжёлый самолётный',icon:'✈',launch:'Полоса',speed:48,turn:17,climb:4.7,drain:.043,hover:false,stability:95,payload:6,range:14,difficulty:5,unlock:7,price:8200,desc:'Крупный игровой профиль с высокой крейсерской скоростью.'},
  {id:'altius',cat:'mil',name:'Альтиус · игровой профиль',short:'Альтиус',family:'Высотный самолётный',icon:'✈',launch:'Полоса',speed:50,turn:15,climb:4.2,drain:.038,hover:false,stability:97,payload:7,range:16,difficulty:5,unlock:8,price:10000,desc:'Самый экономичный и устойчивый профиль для продолжительных полётов.'}
];

const MISSION_CATALOG = [
  {id:'free',name:'Свободный полёт',icon:'∞',level:1,reward:0,xp:0,description:'Летайте без обязательных целей и тренируйте управление.',recommended:['mini','camera','fpv','vtol']},
  {id:'training',name:'Маршрутная подготовка',icon:'◌',level:1,reward:420,xp:180,description:'Пройдите контрольные кольца и вернитесь на посадочную площадку.',recommended:['mini','camera','eleron']},
  {id:'survey',name:'Аэросъёмка района',icon:'▦',level:1,reward:620,xp:240,description:'Последовательно стабилизируйте аппарат над точками съёмки.',recommended:['camera','wing','orlan']},
  {id:'search',name:'Поисковая операция',icon:'⌕',level:2,reward:760,xp:300,description:'Проверьте поисковые зоны и обнаружьте учебный радиомаяк.',recommended:['rescue','camera','vtol']},
  {id:'delivery',name:'Доставка медикаментов',icon:'✚',level:2,reward:840,xp:320,description:'Доставьте условный груз и зависните в зоне приёма.',recommended:['hex','rescue','vtol']},
  {id:'inspection',name:'Осмотр инфраструктуры',icon:'⌁',level:3,reward:900,xp:350,description:'Пройдите точки осмотра в заданном диапазоне высоты.',recommended:['camera','wing','supercam']},
  {id:'landing',name:'Посадка при ветре',icon:'H',level:3,reward:980,xp:380,description:'Выполните короткий круг и точную посадку в сложных условиях.',recommended:['mini','vtol','eleron']},
  {id:'emergency',name:'Аварийный возврат',icon:'!',level:4,reward:1150,xp:440,description:'После контрольной точки заряд снизится. Вернитесь кратчайшим маршрутом.',recommended:['wing','orlan','vtol']},
  {id:'firewatch',name:'Мониторинг пожара',icon:'△',level:4,reward:1240,xp:470,description:'Облетите безопасный периметр и соберите данные по четырём секторам.',recommended:['wing','supercam','forpost']},
  {id:'custom',name:'Свой маршрут',icon:'＋',level:1,reward:240,xp:100,description:'Поставьте собственные точки на карте и пройдите их в заданном порядке.',recommended:[]},
  {id:'daily',name:'Ежедневное испытание',icon:'★',level:1,reward:1500,xp:520,description:'Одинаковые условия для всех игроков сегодня. Доступно один раз в сутки.',recommended:[]}
];

const WEATHER_PRESETS = {
  calm:{id:'calm',label:'Штиль',wind:0,dir:40,visibility:1,drain:1,difficulty:0},
  breeze:{id:'breeze',label:'Лёгкий ветер',wind:2.8,dir:125,visibility:1,drain:1.04,difficulty:1},
  windy:{id:'windy',label:'Порывистый ветер',wind:6.5,dir:230,visibility:.95,drain:1.12,difficulty:2},
  fog:{id:'fog',label:'Туман',wind:1.3,dir:75,visibility:.52,drain:1.03,difficulty:2},
  rain:{id:'rain',label:'Дождь',wind:4.2,dir:185,visibility:.72,drain:1.1,difficulty:2},
  snow:{id:'snow',label:'Снег',wind:3.4,dir:300,visibility:.68,drain:1.14,difficulty:3}
};

const DIFFICULTIES = {
  easy:{label:'Курсант',physics:.78,eventChance:.28,reward:.85,assist:true},
  normal:{label:'Пилот',physics:1,eventChance:.52,reward:1,assist:true},
  hard:{label:'Инструктор',physics:1.2,eventChance:.8,reward:1.35,assist:false}
};

const ACHIEVEMENTS = [
  {id:'first_flight',name:'Первый вылет',desc:'Завершить первый полёт',icon:'◉'},
  {id:'soft_landing',name:'Мягкая посадка',desc:'Посадить аппарат с точностью 90%+',icon:'H'},
  {id:'navigator',name:'Навигатор',desc:'Пройти 25 контрольных точек',icon:'⌁'},
  {id:'economy',name:'Экономичный пилот',desc:'Завершить миссию с зарядом 60%+',icon:'⚡'},
  {id:'storm',name:'Сквозь непогоду',desc:'Завершить миссию при сильном ветре, дожде или снеге',icon:'☂'},
  {id:'night_owl',name:'Ночная смена',desc:'Завершить миссию ночью',icon:'☾'},
  {id:'veteran',name:'100 километров',desc:'Налетать суммарно 100 км',icon:'◇'},
  {id:'collector',name:'Испытатель',desc:'Выполнить полёт на 8 разных аппаратах',icon:'✣'},
  {id:'daily',name:'Испытание дня',desc:'Завершить ежедневное испытание',icon:'★'}
];

const EVENT_CATALOG = [
  {id:'gust',title:'Резкий порыв',text:'Кратковременно усилился боковой ветер.',duration:9,severity:'warning'},
  {id:'battery',title:'Просадка аккумулятора',text:'Запас энергии неожиданно снизился.',duration:4,severity:'danger'},
  {id:'compass',title:'Дрейф компаса',text:'Показания курса временно неточны.',duration:11,severity:'warning'},
  {id:'gps',title:'Слабый спутниковый сигнал',text:'Слежение карты временно отключено.',duration:8,severity:'warning'},
  {id:'raincell',title:'Локальный дождь',text:'Впереди кратковременная зона осадков.',duration:14,severity:'warning'},
  {id:'motorheat',title:'Нагрев силовой установки',text:'Максимальная тяга временно ограничена.',duration:12,severity:'danger'}
];

const DEFAULT_CENTER = {lat:55.7558,lon:37.6176};
const STORAGE_KEY = 'aurora-uav-profile-v4';
const SETTINGS_KEY = 'aurora-uav-settings-v4';
