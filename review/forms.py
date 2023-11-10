from django import forms

class ReviewForm(forms.Form):
    id = forms.IntegerField(label='Review ID', widget=forms.HiddenInput())
    category = forms.CharField(label='Category', max_length=10, widget=forms.HiddenInput())
    review_item = forms.CharField(label='Item ID', max_length=20, widget=forms.HiddenInput())
    review_rating = forms.FloatField(label='Rating')
    review_data = forms.CharField(label='Review', required=False)
    review_tags = forms.CharField(label='Tags', required=False)