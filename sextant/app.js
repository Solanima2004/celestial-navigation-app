// --- グローバル変数 ---
let lopDataStore = []; // 位置の線のデータを保存する配列

// --- HTMLの要素を取得 ---
const observationForm = document.getElementById('observation-form');
const ghaResult = document.getElementById('gha-result');
const declinationResult = document.getElementById('declination-result');
const computedAltitudeResult = document.getElementById('computed-altitude-result');
const azimuthResult = document.getElementById('azimuth-result');
const trueAltitudeResult = document.getElementById('true-altitude-result');
const correctionDiffResult = document.getElementById('correction-diff-result');

// --- 天文計算の関数群 ---
function getSunCoords(date) {
    const J2000 = 2451545.0;
    const jd = date.getTime() / 86400000 - 0.5 + 2440588.5;
    const d = jd - J2000;
    const M = toRad(357.5291 + 0.98560028 * d);
    const L = toRad(280.459 + 0.98564736 * d);
    const C = (1.9148 * Math.sin(M)) + (0.0200 * Math.sin(2 * M)) + (0.0003 * Math.sin(3 * M));
    const eclipticLongitude = L + toRad(C);
    const meanObliquity = toRad(23.4393 - 0.00000036 * d);
    const Omega = toRad(125.04 - 0.052954 * d);
    const deltaPsi = -17.20 * Math.sin(Omega) - 1.32 * Math.sin(2 * L);
    const deltaEpsilon = 9.20 * Math.cos(Omega) + 0.57 * Math.cos(2 * L);
    const trueObliquity = meanObliquity + toRad(deltaEpsilon / 3600);
    const apparentEclipticLongitude = eclipticLongitude + toRad(deltaPsi / 3600);
    const rightAscension = Math.atan2(Math.cos(trueObliquity) * Math.sin(apparentEclipticLongitude), Math.cos(apparentEclipticLongitude));
    const declination = Math.asin(Math.sin(trueObliquity) * Math.sin(apparentEclipticLongitude));
    return { ra: rightAscension, dec: declination, eclipticLongitudeRad: apparentEclipticLongitude, obliquityRad: trueObliquity };
}

function getGast(date, deltaPsiRad, obliquityRad) {
    const J2000 = 2451545.0;
    const jd = date.getTime() / 86400000 + 2440587.5;
    const d = jd - J2000;
    const gmstHours = 18.697374558 + 24.06570982441908 * d;
    const gmstDeg = (gmstHours % 24) * 15;
    const equationOfEquinoxes = toDeg(deltaPsiRad * Math.cos(obliquityRad));
    const gastDeg = gmstDeg + equationOfEquinoxes;
    return gastDeg < 0 ? gastDeg + 360 : (gastDeg % 360);
}


// === フォームが送信されたときの処理 ===
observationForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const worldTimeValue = document.getElementById('world-time').value;
    const latitude = parseFloat(document.getElementById('latitude').value);
    const longitude = parseFloat(document.getElementById('longitude').value);

    if (!worldTimeValue || isNaN(latitude) || isNaN(longitude)) {
        alert('観測情報の値を正しく入力してください。');
        return;
    }
    
    updatePositionMarker(latitude, longitude);

    const date = new Date(worldTimeValue + 'Z');
    
    const sunCoords = getSunCoords(date);
    const declinationRad = sunCoords.dec;
    const rightAscensionRad = sunCoords.ra;
    const declinationDeg = toDeg(declinationRad);

    const J2000 = 2451545.0;
    const rightAscensionDeg = toDeg(rightAscensionRad);
    const deltaPsiRadForGst = toRad(((-17.20 * Math.sin(toRad(125.04 - 0.052954 * (date.getTime() / 86400000 - 0.5 + 2440588.5 - J2000)))) / 3600));
    const gastDeg = getGast(date, deltaPsiRadForGst, sunCoords.obliquityRad);
    let ghaDeg = gastDeg - rightAscensionDeg;
    if (ghaDeg < 0) ghaDeg += 360;
  
    const lhaDeg = ghaDeg + longitude;
    const latRad = toRad(latitude);
    const lhaRad = toRad(lhaDeg);
    const sinHc = Math.sin(latRad) * Math.sin(declinationRad) + Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(lhaRad);
    const hcRad = Math.asin(sinHc);
    const hcDeg = toDeg(hcRad);
    const hcDegreesInt = Math.floor(hcDeg);
    const hcMinutes = (hcDeg - hcDegreesInt) * 60;
    const formattedHc = `${hcDegreesInt}° ${hcMinutes.toFixed(1)}′`;

    const numerator = Math.sin(declinationRad) - Math.sin(hcRad) * Math.sin(latRad);
    const denominator = Math.cos(hcRad) * Math.cos(latRad);
    let azimuthDeg = 0;
    if (Math.abs(denominator) > 1e-9) {
        let cosAz = numerator / denominator;
        cosAz = Math.max(-1, Math.min(1, cosAz)); 
        azimuthDeg = toDeg(Math.acos(cosAz));
    }
    let normalizedLha = lhaDeg % 360;
    if (normalizedLha < 0) normalizedLha += 360;
    if (normalizedLha > 0 && normalizedLha < 180) {
        azimuthDeg = 360 - azimuthDeg;
    }

    const hsDegVal = parseFloat(document.getElementById('altitude-deg').value) || 0;
    const hsMin = parseFloat(document.getElementById('altitude-min').value) || 0;
    const ieSign = parseFloat(document.getElementById('ie-sign').value) || 1;
    const ieDeg = parseFloat(document.getElementById('ie-deg').value) || 0;
    const ieMin = parseFloat(document.getElementById('ie-min').value) || 0;
    const eyeHeight = parseFloat(document.getElementById('eye-height').value);
    const refractionMin = parseFloat(document.getElementById('refraction').value) || 0;
    const parallaxMin = parseFloat(document.getElementById('parallax').value) || 0;

    if (isNaN(eyeHeight)) {
      alert('高度補正の値を正しく入力してください。');
      return;
    }

    const hsTotalDeg = hsDegVal + hsMin / 60;
    const ieTotalDeg = ieSign * (ieDeg + ieMin / 60);
    const dipDeg = (1.776 * Math.sqrt(eyeHeight)) / 60;
    const refractionDeg = refractionMin / 60;
    const parallaxDeg = parallaxMin / 60;
    
    const hoDeg = hsTotalDeg + ieTotalDeg - dipDeg - refractionDeg + parallaxDeg;

    const correctionDiffDeg = hoDeg - hsTotalDeg;
    const correctionDiffMin = correctionDiffDeg * 60;

    const hoDegreesInt = Math.floor(hoDeg);
    const hoMinutes = (hoDeg - hoDegreesInt) * 60;
    const formattedHo = `${hoDegreesInt}° ${hoMinutes.toFixed(1)}′`;
    
    const formattedCorr = `${correctionDiffMin > 0 ? '+' : ''}${correctionDiffMin.toFixed(1)}′`;
    
    const interceptDeg = hoDeg - hcDeg;
    const interceptNm = interceptDeg * 60;

    const currentLopData = {};
    lopDataStore.push(currentLopData);
    
    drawLOP(latitude, longitude, azimuthDeg, interceptNm, currentLopData);

    if (lopDataStore.length >= 2) {
        const lop1 = lopDataStore[lopDataStore.length - 2];
        const lop2 = lopDataStore[lopDataStore.length - 1];
        const fixPoint = findIntersection(lop1.p1, lop1.p2, lop2.p1, lop2.p2);
        if (fixPoint) {
            drawFix(fixPoint[0], fixPoint[1]);
        }
    }

    ghaResult.textContent = ghaDeg.toFixed(4) + '°';
    declinationResult.textContent = declinationDeg.toFixed(4) + '°';
    computedAltitudeResult.textContent = formattedHc;
    azimuthResult.textContent = azimuthDeg.toFixed(1) + '°';
    trueAltitudeResult.textContent = formattedHo;
    correctionDiffResult.textContent = formattedCorr;
});


// === リセットボタンの処理 ===
const resetButton = document.getElementById('reset-button');
resetButton.addEventListener('click', () => {
    observationForm.reset();
    lopDataStore = [];
    resetMap();

    ghaResult.textContent = '--.--';
    declinationResult.textContent = '--.--';
    computedAltitudeResult.textContent = '--.--';
    azimuthResult.textContent = '--.--';
    trueAltitudeResult.textContent = '--.--';
    correctionDiffResult.textContent = '--.--';
});