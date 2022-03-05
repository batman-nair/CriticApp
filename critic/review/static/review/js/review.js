const baseUrl = window.location.origin;

async function getSearchItems(category, query) {
    const searchUrl = `${baseUrl}/search_item/${category}/${query}`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    console.log('Got data from search', query, data);
    if (data["Response"] == "False") {
        console.log("Got error from search ", query, data["Error"]);
        return [];
    }
    return data["Results"];
}

async function getReviewItem(category, itemID) {
    const response = await fetch(`${baseUrl}/get_item_info/${category}/${itemID}`);
    const data = await response.json();
    console.log('Got review details: ', data);
    return data;
}

async function updateReviewItem(category, itemID, reviewCard) {
    const data = await getReviewItem(category, itemID);
    console.log('Got review item data: ', data);
    let titleDOM = reviewCard.querySelector(".review-title");
    let yearDOM = reviewCard.querySelector(".review-year");
    let imageDOM = reviewCard.querySelector("img");
    titleDOM.innerHTML = data["Title"] + " " + yearDOM.outerHTML;
    if (data["ImageURL"] != "N/A") {
        imageDOM.src = data["ImageURL"];
    } else {
        imageDOM.src = "";
    }
    reviewCard.querySelector(".review-year").innerText = data["Year"];
    reviewCard.querySelector(".review-attr1").innerText = data["Attr1"];
    console.log(reviewCard.querySelector("img").height, reviewCard.querySelector("img").width);
    let descriptionDOM = reviewCard.querySelector(".review-description");
    let descriptionDOMBelow = reviewCard.querySelector(".review-description-below");
    console.log('Details', imageDOM.width, imageDOM.height, data["Description"].length);
    if (imageDOM.width > imageDOM.height || data["Description"].length > 300) {
        descriptionDOM.innerHTML = "";
        descriptionDOM = descriptionDOMBelow;
        descriptionDOMBelow.removeAttribute("hidden");
    } else {
        descriptionDOMBelow.innerHTML = "";
        descriptionDOMBelow.setAttribute("hidden", "");
    }
    descriptionDOM.innerHTML = data["Description"];
    reviewCard.querySelector(".review-attr2").innerText = data["Attr2"];
    reviewCard.querySelector(".review-rating").innerText = data["Rating"];
    reviewCard.removeAttribute("hidden");
}

function updateForm(category, itemID) {
    document.querySelector("#id_item_id").value = itemID;
    document.querySelector("#id_category").value = category;
    document.querySelector("#review-form").removeAttribute("disabled");
}

async function getReviews(query='', username='', filter_categories=[], ordering='') {
    const reviewUrl = new URL(`${baseUrl}/reviews`);
    if (query) {
        reviewUrl.searchParams.append('query', query);
    }
    if (username) {
        reviewUrl.searchParams.append('username', username);
    }
    for (category of filter_categories) {
        reviewUrl.searchParams.append('filter_categories', category);
    }
    if (ordering) {
        reviewUrl.searchParams.append('ordering', ordering);
    }
    const response = await fetch(reviewUrl);
    const data = await response.json();
    console.log('Got reviews', data);
    return [...data["Results"], ...data["Results"]];
}

function buildReviewCard(review) {
    const reviewCardWrapper = document.createElement("div");
    reviewCardWrapper.classList.add('mb-4');
    if (review.ReviewItem.Category == 'game') {
        reviewCardWrapper.classList.add('col-6', 'col-lg-6');
    }
    else {
        reviewCardWrapper.classList.add('col-6', 'col-lg-3');
    }
    const content = `
        <div class="card review-card">
            <img src="${review.ReviewItem.ImageURL}" class="card-img-top" alt="Poster Image">
            <div class="card-body">
                <h5 class="card-title">${review.ReviewItem.Title}</h5>
                <p class="card-text"><small class="attr1 text-muted">${review.ReviewItem.Attr1}</small></p>
                <p class="description card-text">${review.ReviewData}</p>
                <p class="rating card-text">${review.Rating}⭐</p>
            </div>
        </div>
    `;
    reviewCardWrapper.innerHTML = content;
    return reviewCardWrapper;
}

function populateReviewCards(parentSelector, reviews) {
    const container = document.querySelector(parentSelector);
    container.innerHTML = "";
    for (var review of reviews) {
        const reviewCard = buildReviewCard(review);
        container.appendChild(reviewCard);
    }
}

// From freecodecamp
function debounce(func, timeout=300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    }
}