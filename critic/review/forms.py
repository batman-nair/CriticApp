from django import forms

class ReviewForm(forms.Form):
    item_id = forms.CharField(label='Item ID', max_length=20, widget=forms.HiddenInput())
    category = forms.CharField(label='Category', max_length=10, widget=forms.HiddenInput())
    rating = forms.FloatField(label='Rating')
    review = forms.CharField(label='Review', required=False)